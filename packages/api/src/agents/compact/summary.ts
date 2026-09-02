import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes, EModelEndpoint, FileSources } from 'librechat-data-provider';
import {
  Providers,
  HumanMessage,
  buildSummaryCarrierText,
  buildSummarizationInstruction,
  formatMessage,
  initializeModel,
  formatAgentMessages,
  getMaxOutputTokensKey,
} from '@librechat/agents';
import type {
  Agent,
  TMessage,
  AgentModelParameters,
  SummarizationConfig,
  SummaryContentPart,
} from 'librechat-data-provider';
import type { BaseMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { IMongoFile } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import type { ClientOptions } from '@librechat/agents';
import type { Types } from 'mongoose';
import type { EndpointDbMethods, OpenAIConfiguration, RequestBody, ServerRequest } from '~/types';
import type { FormattedMessageWithContent } from '~/agents/client';
import type { EndpointTokenConfig } from '~/types/tokens';
import type { OwnerFileFilter } from '~/files/history';
import {
  buildOwnerFileFilter,
  collectSteerFileRefs,
  collectMessageFileRefs,
  collectHistoricalFileIds,
} from '~/files/history';
import { extractInvokedSkillsFromPayload, shouldReplayReasoningContent } from '~/agents/run';
import { createMultiAgentMapper, prependFileContext, prependQuotes } from '~/agents/client';
import { getProviderConfig, providerConfigMap } from '~/endpoints/config/providers';
import { stripActivityLabelParts } from '~/agents/activityLabels/wiring';
import { resolveConfigHeaders } from '~/utils/headers';
import { extractFileContext } from '~/files/context';
import { extractLibreChatParams } from '~/utils/llm';
import { getModelMaxTokens } from '~/utils/tokens';
import { countTokens } from '~/utils/tokenizer';
import { createSafeUser } from '~/utils/env';

/**
 * Resolves the bodies of skills invoked in the branch so the checkpoint can
 * record their constraints. Injected as a pair: the accessible-id lookup is the
 * ACL gate, and a skill outside it must never be resolved.
 */
export interface CompactionSkillDeps {
  findAccessibleSkillIds: () => Promise<Types.ObjectId[]>;
  getSkillByName: (
    name: string,
    accessibleIds: Types.ObjectId[],
  ) => Promise<{ body: string; name: string } | null>;
}

/** Agent lookup by id, for labelling multi-agent history. */
export type GetAgentFn = (search: { id: string }) => Promise<Agent | null>;

/** Owner-scoped file lookup, injected so this module stays free of the db. */
export type GetFilesFn = (filter: OwnerFileFilter) => Promise<IMongoFile[] | null>;

/** Upper bound for a manual compaction call, mirroring the run-level detour. */
const COMPACTION_TIMEOUT_MS = 120_000;

/**
 * Instruction sent with the branch transcript when the user compacts on
 * demand. Deliberately mirrors the checkpoint shape the SDK's automatic
 * summarization produces so a manual and an automatic summary read the same
 * in the transcript, and so a later automatic pass can update either one.
 */
export const DEFAULT_COMPACTION_PROMPT = `Write a checkpoint of everything so far. This checkpoint replaces the messages above, so capture everything needed to pick right back up.

Don't second-guess or fact-check anything. Tool results reflect exactly what happened; a truncated result is a display artifact of context management, the tool ran in full. Record what was done and observed. Only the checkpoint, don't respond to me or continue the conversation.

## Checkpoint

## Goal
What I asked for and any sub-goals identified.

## Constraints & Preferences
Any rules, preferences, or configuration I established.

## Progress
### Done
- What was completed and the outcomes

### In Progress
- What is currently underway

## Key Decisions
Decisions made and why.

## Next Steps
Concrete remaining actions, in priority order.

## Critical Context
Exact identifiers, names, error messages, URLs, and details to preserve verbatim.

Rules:
- Record what happened, don't judge or re-evaluate it
- For each tool call: the tool name, key inputs, and the outcome
- Preserve exact identifiers, names, errors, and references verbatim
- Short declarative sentences
- Skip empty sections`;

/** Used instead of {@link DEFAULT_COMPACTION_PROMPT} when a prior summary exists. */
export const DEFAULT_COMPACTION_UPDATE_PROMPT = `Update the checkpoint. Merge the new messages into the existing checkpoint and return a single consolidated replacement.

Keep it roughly the same length as the last checkpoint. Compress older details to make room for what's new rather than appending. Give recent actions more detail, compress older items to one-liners.

Don't fact-check or second-guess anything. Tool results are ground truth; a truncated result is a display artifact, the tool ran in full. Only the checkpoint, don't respond to me or continue the conversation.

Rules:
- Merge new progress into existing sections, don't duplicate headers
- Compress older completed items into one-line entries
- Move items from "In Progress" to "Done" once completed
- Update "Next Steps" to reflect current priorities
- For each new tool call: the tool name, key inputs, and the outcome
- Preserve exact identifiers, names, errors, and references verbatim
- Skip empty sections`;

/** Azure resolution reads an instance name that only some configs carry. */
type MaybeAzureConfig = ClientOptions & {
  azureOpenAIApiInstanceName?: string;
  configuration?: OpenAIConfiguration;
};

/** Normalized usage of a single compaction call, shaped for `recordCollectedUsage`. */
export interface CompactionUsage {
  model?: string;
  /**
   * REQUIRED for correct billing. `splitUsage` only subtracts cache units from
   * `input_tokens` when the provider is one whose input already includes them
   * (`inputTokensIncludesCache`); dropping it bills a cached compaction as raw
   * input PLUS the cache units again.
   */
  provider?: string;
  input_tokens?: number;
  output_tokens?: number;
  /**
   * Kept because `resolveCompletionTokens` repairs providers (Vertex among
   * them) that report hidden reasoning only in the total; without it those
   * compactions are billed for visible output alone.
   */
  total_tokens?: number;
  input_token_details?: { cache_read?: number; cache_creation?: number };
}

/** One provider call: what it reported, and what it locally measured. */
export interface CompactionPass {
  /** Absent when the gateway omitted usage metadata for this call. */
  usage?: CompactionUsage;
  counted: { input_tokens: number; output_tokens: number };
}

export interface CompactionModel {
  provider: Providers;
  /** The endpoint the call resolved to. */
  endpoint: string;
  /**
   * Endpoint key for `getModelMaxTokens`. A NAMED custom endpoint (`Ollama`)
   * is not a key in the built-in token maps, which index custom models under
   * `EModelEndpoint.custom`; passing the literal name there silently yields the
   * fallback window.
   */
  tokenLookupEndpoint: EModelEndpoint;
  model?: string;
  clientOptions: ClientOptions;
  /** True when the target replays `reasoning_content` across turns, which
   *  decides whether the branch must be formatted with it reconstructed. */
  replaysReasoningContent: boolean;
  endpointTokenConfig?: EndpointTokenConfig;
  /** True when compaction resolved to the agent's OWN endpoint, which decides
   *  whether `endpointTokenConfig` is authoritative for pricing. */
  sameEndpoint: boolean;
  /** True when it also resolved to the model the conversation runs on, which
   *  decides whether that conversation's own context limit describes it. */
  usesRunModel: boolean;
}

/** Minimal agent view compaction needs: provider, endpoint, and model. */
export interface CompactionAgent {
  provider: string;
  model?: string | null;
  /** Set by `initializeAgent`; absent on a freshly loaded agent document, where
   *  `provider` already names the endpoint. */
  endpoint?: string | null;
  model_parameters?: Partial<AgentModelParameters> & { model?: string };
  /** Resolved `maxContextTokens`. Authoritative over the built-in token map,
   *  exactly as it is for a normal turn: a custom model the map does not know
   *  is otherwise sized against the fallback window. */
  maxContextTokens?: number;
  /** Resolved `resendFiles`. False means the user turned OFF re-sending
   *  previously uploaded files, which historical hydration must respect. */
  resendFiles?: boolean;
  /** Resolved `fileTokenLimit`, which an enforced model spec may set. */
  fileTokenLimit?: number;
}

/** Stored user-key expiry lookup, used to build the freshness marker. */
export type GetUserKeyExpiryFn = (params: {
  userId: string;
  name: string;
}) => Promise<{ expiresAt: Date | 'never' | null }>;

export type CompactionDbMethods = EndpointDbMethods & {
  getUserKeyExpiry?: GetUserKeyExpiryFn;
};

export interface ResolveCompactionModelParams {
  req: ServerRequest;
  agent: CompactionAgent;
  /** Request-scoped ids for header placeholder resolution. */
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: CompactionDbMethods;
}

/**
 * Splits `summarization.parameters` the way the SDK's summarize node does:
 * `maxSummaryTokens` is a summarization-only knob routed to the provider's
 * output-cap key, everything else is a plain client option.
 */
function separateSummarizationParameters(parameters?: SummarizationConfig['parameters']): {
  llmParams: Record<string, unknown>;
  maxSummaryTokens?: number;
} {
  const llmParams: Record<string, unknown> = {};
  let maxSummaryTokens: number | undefined;
  for (const [key, value] of Object.entries(parameters ?? {})) {
    if (key === 'maxSummaryTokens') {
      if (typeof value === 'number' && value > 0) {
        maxSummaryTokens = value;
      }
      continue;
    }
    llmParams[key] = value;
  }
  return { llmParams, maxSummaryTokens };
}

function normalizeEndpointName(value: string): string {
  return value.trim().toLowerCase();
}

/** Names the built-in map owns, where case carries no identity. */
const CANONICAL_ENDPOINT_NAMES = new Set(
  Object.keys(providerConfigMap).map((key) => key.toLowerCase()),
);

/**
 * Whether two endpoint names denote the same endpoint.
 *
 * Case folds only for the built-in names, which are canonical. A yaml custom
 * endpoint's name IS its identity: `loadCustomEndpointsConfig` preserves case
 * so `Foo` and `foo` can be two endpoints with different credentials, and
 * `getProviderConfig` gives an exact match precedence for that reason. Folding
 * case here would leave a configured summarizer unresolved and silently run
 * compaction on the conversation's own endpoint instead.
 */
function isSameEndpoint(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  const a = normalizeEndpointName(left);
  const b = normalizeEndpointName(right);
  return a === b && CANONICAL_ENDPOINT_NAMES.has(a) && CANONICAL_ENDPOINT_NAMES.has(b);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Ordered root→leaf walk of the branch ending at `parentMessageId`, mirroring
 * `BaseClient.getMessagesForConversation`. Builds a Map first so the walk stays
 * O(n) instead of re-scanning the array per hop.
 */
export function selectBranchMessages(
  messages: TMessage[],
  parentMessageId?: string | null,
): TMessage[] {
  if (!messages || messages.length === 0 || !isNonEmptyString(parentMessageId)) {
    return [];
  }

  const byId = new Map<string, TMessage>();
  for (const message of messages) {
    byId.set(message.messageId, message);
  }

  const branch: TMessage[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = parentMessageId;

  while (isNonEmptyString(currentId)) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    const message = byId.get(currentId);
    if (!message) {
      break;
    }
    branch.push(message);
    currentId =
      message.parentMessageId === Constants.NO_PARENT ? null : (message.parentMessageId ?? null);
  }

  return branch.reverse();
}

/** Text sources are the ones `extractFileContext` inlines verbatim. */
function isInlinedTextSource(file: IMongoFile): boolean {
  return file.source === FileSources.text && typeof file.text === 'string' && file.text !== '';
}

/**
 * Names of the agents whose parts appear in the branch, so
 * `createMultiAgentMapper` can label parallel replies instead of flattening
 * them into anonymous assistant content. The normal run has these from its own
 * `agentConfigs`; here they come from the ids the stored content already
 * carries, which the caller demonstrably interacted with.
 */
async function resolveHistoryAgents(
  branch: TMessage[],
  getAgent?: GetAgentFn,
): Promise<Map<string, Agent> | undefined> {
  if (!getAgent) {
    return undefined;
  }
  const agentIds = new Set<string>();
  for (const message of branch) {
    if (message.isCreatedByUser || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      const agentId = (part as { agentId?: string } | null)?.agentId;
      if (typeof agentId === 'string' && agentId !== '') {
        agentIds.add(agentId);
      }
    }
  }
  if (agentIds.size === 0) {
    return undefined;
  }
  /**
   * A REJECTED lookup is not the same as a missing agent. Swallowing it leaves
   * an empty map, and the mapper still strips the stored `agentId`/`groupId`
   * routing metadata, so parallel replies would merge into anonymous assistant
   * content in a permanent checkpoint. A deleted agent still resolves to null
   * and compacts, unlabelled, as before.
   */
  const resolved = await Promise.all(Array.from(agentIds).map((id) => getAgent({ id })));
  const configs = new Map<string, Agent>();
  for (const found of resolved) {
    if (found?.id) {
      configs.set(found.id, found);
    }
  }
  return configs.size > 0 ? configs : undefined;
}

/** Bodies of every skill the branch invoked, keyed by name. */
async function resolveInvokedSkillBodies(
  payload: Array<Partial<TMessage>>,
  deps?: CompactionSkillDeps,
): Promise<Map<string, string> | undefined> {
  if (!deps) {
    return undefined;
  }
  const invoked = extractInvokedSkillsFromPayload(
    payload as Array<Partial<{ role: string; content: unknown }>>,
  );
  if (invoked.size === 0) {
    return undefined;
  }
  const accessibleIds = await deps.findAccessibleSkillIds();
  if (accessibleIds.length === 0) {
    return undefined;
  }
  /** Deliberately NOT `allSettled`: a transient lookup failure would drop that
   *  skill's constraints from a checkpoint that then permanently replaces the
   *  invocation. Failing lets the user retry with the skill intact. A skill the
   *  ACL simply does not grant resolves to `null` and is skipped, as before. */
  const resolved = await Promise.all(
    Array.from(invoked).map((name) => deps.getSkillByName(name, accessibleIds)),
  );
  const bodies = new Map<string, string>();
  for (const skill of resolved) {
    if (skill?.body) {
      bodies.set(skill.name, skill.body);
    }
  }
  return bodies.size > 0 ? bodies : undefined;
}

/**
 * Rebuilds the document text an attachment-bearing turn contributed, the way
 * `BaseClient.addPreviousAttachments` does before a normal turn.
 *
 * Without it these raw database rows carry only file references, so a branch
 * built around an uploaded document would be replaced by a summary that never
 * saw the document. The lookup is owner-scoped through `buildOwnerFileFilter`,
 * so a forged reference cannot pull another user's file into the transcript.
 */
/**
 * The messages that survive formatting: the newest checkpoint and everything
 * after it, or the whole branch when there is none. The checkpoint message
 * itself is kept, since its text is what the next pass consolidates.
 */
function retainedSegment(branch: TMessage[]): TMessage[] {
  for (let index = branch.length - 1; index >= 0; index--) {
    const content = branch[index].content;
    if (Array.isArray(content) && content.some((part) => part?.type === ContentTypes.SUMMARY)) {
      return branch.slice(index);
    }
  }
  return branch;
}

async function hydrateAttachments(
  branch: TMessage[],
  req: ServerRequest,
  getFiles?: GetFilesFn,
  /** Resolved `fileTokenLimit`: an enforced model spec can set one, and
   *  `extractFileContext` would otherwise read the client-controlled request
   *  field or the global default and inline more than the administrator
   *  allowed. */
  fileTokenLimit?: number,
): Promise<HydratedAttachments> {
  const contextByMessageId = new Map<string, string>();
  const contextBySteerPart = new Map<string, string>();
  const empty = { contextByMessageId, contextBySteerPart };
  if (!getFiles) {
    return empty;
  }
  const filter = buildOwnerFileFilter(collectHistoricalFileIds(branch), req.user);
  if (!filter) {
    return empty;
  }
  const files = (await getFiles(filter)) ?? [];
  const byId = new Map(files.map((file) => [file.file_id, file]));
  /** Shallow clone rather than a mutation: the caller's request must keep its
   *  own body for the rest of its lifetime. Zero is carried like any other
   *  value: it is a valid configured limit, and it means inline nothing. */
  const extractionReq = (
    fileTokenLimit != null ? { ...req, body: { ...(req.body ?? {}), fileTokenLimit } } : req
  ) as ServerRequest;
  /**
   * Deduplicated across the RETAINED segment, as the normal history path
   * deduplicates across a branch: a document reattached to several turns would
   * otherwise be inlined in full each time, inflating the prompt into passes
   * the user pays for. Reset at a summary boundary, because
   * `formatAgentMessages` discards everything before it and a file attached on
   * both sides must still hydrate onto the occurrence that survives.
   */
  const seen = new Set<string>();
  for (const message of branch) {
    if (
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === ContentTypes.SUMMARY)
    ) {
      seen.clear();
    }
    const resolve = (refs: Array<{ file_id?: string }>): IMongoFile[] => {
      const attachments: IMongoFile[] = [];
      for (const ref of refs) {
        if (!ref?.file_id || seen.has(ref.file_id)) {
          continue;
        }
        const file = byId.get(ref.file_id);
        if (file) {
          attachments.push(file);
          seen.add(ref.file_id);
        }
      }
      return attachments;
    };
    /** Steer refs FIRST, so a file the user attached mid-run is claimed by the
     *  part that replays it rather than by the enclosing assistant turn. */
    for (const { index, refs } of collectSteerFileRefs(message)) {
      const combined = await describeAttachments(resolve(refs), extractionReq);
      if (combined) {
        contextBySteerPart.set(`${message.messageId}#${index}`, combined);
      }
    }
    const combined = await describeAttachments(
      resolve(collectMessageFileRefs(message)),
      extractionReq,
    );
    if (combined) {
      contextByMessageId.set(message.messageId, combined);
    }
  }
  return empty;
}

interface HydratedAttachments {
  contextByMessageId: Map<string, string>;
  /** Keyed `${messageId}#${partIndex}`. */
  contextBySteerPart: Map<string, string>;
}

/** Inlined text plus a manifest of what could not be inlined, or nothing. */
async function describeAttachments(attachments: IMongoFile[], req: ServerRequest): Promise<string> {
  if (attachments.length === 0) {
    return '';
  }
  const fileContext = await extractFileContext({
    attachments,
    req,
    tokenCountFn: (text: string) => countTokens(text),
  });
  /**
   * `extractFileContext` only inlines text sources. Images, audio, video and
   * provider-native documents are deliberately NOT re-encoded here: the
   * summarizer may be a cheap text model on another endpoint, and a
   * checkpoint cannot carry pixels anyway. What it CAN carry is the fact that
   * they existed, so they are listed by name and type and the summary records
   * them instead of dropping the turn's attachments silently.
   */
  /** Keyed on what was ACTUALLY inlined: with no `fileTokenLimit` configured
   *  `extractFileContext` returns nothing, and treating text files as inlined
   *  anyway left them with neither their text nor a mention. */
  const media = fileContext
    ? attachments.filter((file) => !isInlinedTextSource(file))
    : attachments;
  const manifest =
    media.length > 0
      ? `[Attachments: ${media
          .map((file) => `${file.filename ?? 'file'} (${file.type ?? 'unknown type'})`)
          .join(', ')}]`
      : '';
  return [fileContext, manifest].filter(Boolean).join('\n\n');
}

/**
 * Shapes stored messages into the `{ role, content }` payload
 * `formatAgentMessages` expects, mirroring what `AgentClient#buildMessages`
 * hands it on a normal turn. Without the explicit role the formatter falls
 * back to sender sniffing and every assistant turn loses its tool-call
 * reconstruction.
 *
 * Quoted excerpts are merged back in for the same reason the send path does it:
 * `formatMessage` leaves `message.quotes` out of the content, and a summary
 * built without them drops the referenced material permanently once it becomes
 * the context boundary.
 */
/**
 * Moves a steer's hydrated attachments onto the steer part itself.
 *
 * `formatAgentMessages` replays a steer as its own `HumanMessage`, built from
 * the part's media or its text. Prepending at MESSAGE level would attach the
 * user's document to the assistant turn that happens to contain the steer, so
 * the summarizer reads it as something the assistant produced.
 */
function applySteerFileContext(
  message: TMessage,
  contextBySteerPart: Map<string, string>,
): TMessage {
  if (!Array.isArray(message.content)) {
    return message;
  }
  const content = message.content.map((part, index) => {
    const context = contextBySteerPart.get(`${message.messageId}#${index}`);
    if (part?.type !== ContentTypes.STEER || !context) {
      return part;
    }
    const steerPart = part as typeof part & { media?: unknown[] };
    /** Media wins over text in the replay, so the context has to ride with it
     *  when one is stored. */
    if (Array.isArray(steerPart.media) && steerPart.media.length > 0) {
      return {
        ...steerPart,
        media: [{ type: ContentTypes.TEXT, text: context }, ...steerPart.media],
      };
    }
    const steerText = steerPart[ContentTypes.STEER];
    return {
      ...steerPart,
      [ContentTypes.STEER]: `${context}\n${typeof steerText === 'string' ? steerText : ''}`,
    };
  });
  return { ...message, content } as TMessage;
}

function toPayload(
  branch: TMessage[],
  fileContextByMessageId: Map<string, string>,
  contextBySteerPart: Map<string, string>,
  mapMultiAgent: (message: TMessage) => TMessage,
): Array<Partial<TMessage>> {
  return branch.map((original) => {
    const source =
      contextBySteerPart.size > 0 ? applySteerFileContext(original, contextBySteerPart) : original;
    /** Added-convo responses carry per-agent groups and routing metadata; the
     *  normal send path maps them to each group's primary output before the
     *  model sees them, so a checkpoint built from the raw content would
     *  summarize duplicate or conflicting answers. */
    const message =
      (source as TMessage & { addedConvo?: boolean }).addedConvo === true
        ? mapMultiAgent(source)
        : source;
    const formatted = formatMessage({
      message: { ...message, role: message.isCreatedByUser ? 'user' : 'assistant' },
    }) as FormattedMessageWithContent;
    const fileContext = fileContextByMessageId.get(message.messageId);
    if (fileContext) {
      prependFileContext(formatted, fileContext);
    }
    if (Array.isArray(message.quotes) && message.quotes.length > 0) {
      prependQuotes(formatted, message.quotes);
    }
    return formatted as Partial<TMessage>;
  });
}

/**
 * Effective model parameters for a compaction call.
 *
 * `buildEndpointOption` resolves the request, and any enforced model spec, into
 * `endpointOption.model_parameters`, while `endpointOption.agent` stays the raw
 * stored document. `initializeAgent` merges the two for the initial agent, so a
 * normal turn runs the resolved parameters; compaction has to apply the same
 * precedence or it silently summarizes with a different model, output cap or
 * routing setting than the conversation it is summarizing. LibreChat-only keys
 * are stripped exactly as the normal path strips them: they are not provider
 * parameters.
 */
export interface ResolvedAgentParameters {
  modelOptions: Partial<AgentModelParameters> & { model?: string };
  /** Authoritative context budget when the conversation or spec sets one. */
  maxContextTokens?: number;
  /** False when the user turned off re-sending previously uploaded files. */
  resendFiles: boolean;
  /** Per-file inlining budget, when the conversation or spec sets one. */
  fileTokenLimit?: number;
}

export function resolveAgentModelParameters(
  agent: CompactionAgent,
  endpointParameters?: Partial<AgentModelParameters>,
): ResolvedAgentParameters {
  const merged = Object.assign(
    { model: agent.model ?? undefined },
    agent.model_parameters ?? {},
    endpointParameters ?? {},
  );
  const { modelOptions, maxContextTokens, resendFiles, fileTokenLimit } = extractLibreChatParams(
    merged as Record<string, unknown>,
  );
  return {
    modelOptions: modelOptions as Partial<AgentModelParameters> & { model?: string },
    maxContextTokens,
    resendFiles,
    fileTokenLimit,
  };
}

/**
 * Sentinel expiry for a cross-endpoint credential this request could not
 * verify. `checkUserKeyExpiry` refuses anything already past, so a target that
 * authenticates with a USER key fails closed instead of running on a
 * credential whose expiry went unread, while one on a server key ignores the
 * marker entirely and is unaffected.
 */
const UNVERIFIABLE_KEY_EXPIRY = new Date(0).toISOString();

/**
 * Endpoint key the built-in maps index this call under, which is not always the
 * endpoint it runs on. A NAMED custom endpoint (`Ollama`) has its models under
 * `custom`, and Vertex AI, which differs from Google only in how it
 * authenticates, has no key of its own. Both `getModelMaxTokens` and
 * `supportsBalanceCheck` are keyed this way, so a literal name there silently
 * yields the fallback window and skips the funds check.
 */
function resolveEndpointKey(endpoint: string, isCustomEndpoint: boolean): EModelEndpoint {
  if (isCustomEndpoint) {
    return EModelEndpoint.custom;
  }
  if (normalizeEndpointName(endpoint) === Providers.VERTEXAI) {
    return EModelEndpoint.google;
  }
  return endpoint as EModelEndpoint;
}

/**
 * Resolves the provider and client options for a manual compaction call.
 *
 * Precedence mirrors the automatic detour: `summarization.provider` /
 * `summarization.model` from `librechat.yaml` win, otherwise compaction runs on
 * the agent's own endpoint and model. An unknown `summarization.provider` falls
 * back to the agent's endpoint with a warning rather than failing the request.
 */
export async function resolveCompactionModel({
  req,
  agent,
  ids,
  db,
}: ResolveCompactionModelParams): Promise<CompactionModel> {
  const appConfig = req.config as AppConfig | undefined;
  const summarization = appConfig?.summarization as SummarizationConfig | undefined;
  const agentEndpoint = agent.endpoint ?? agent.provider ?? '';
  let providerConfig = getProviderConfig({ provider: agentEndpoint, appConfig });
  let endpoint = agentEndpoint;

  /** Cleared when a configured cross-endpoint provider fails to resolve. */
  let modelOverrideApplies = true;
  const configuredProvider = summarization?.provider;
  const targetsOtherEndpoint =
    isNonEmptyString(configuredProvider) && !isSameEndpoint(configuredProvider, agentEndpoint);
  if (targetsOtherEndpoint && isNonEmptyString(configuredProvider)) {
    try {
      providerConfig = getProviderConfig({ provider: configuredProvider, appConfig });
      endpoint = configuredProvider;
    } catch (error) {
      logger.warn(
        `[compact] Unknown summarization.provider "${configuredProvider}", falling back to "${agentEndpoint}"`,
        error,
      );
      providerConfig = getProviderConfig({ provider: agentEndpoint, appConfig });
      endpoint = agentEndpoint;
      /** The configured model belonged to the endpoint that failed to resolve;
       *  carrying it to the agent's endpoint would send an unknown model name
       *  and make the fallback fail just as deterministically. */
      modelOverrideApplies = false;
    }
  }

  const runModel = agent.model_parameters?.model ?? agent.model ?? undefined;
  const model =
    modelOverrideApplies && isNonEmptyString(summarization?.model) ? summarization.model : runModel;

  /**
   * The user-key freshness marker `initializeOpenAI` / `initializeGoogle` read
   * before loading a stored credential. Resolved HERE, from the stored record
   * for the endpoint compaction actually runs on, rather than taken from the
   * request: a cross-endpoint `summarization.provider` means the conversation's
   * own marker would be for the wrong endpoint (or absent), and the server's
   * copy is authoritative anyway.
   */
  let keyExpiry: string | undefined;
  let expiryLookupFailed = false;
  if (db.getUserKeyExpiry) {
    try {
      const stored = await db.getUserKeyExpiry({ userId: req.user?.id ?? '', name: endpoint });
      if (stored?.expiresAt != null) {
        keyExpiry =
          stored.expiresAt === 'never' ? 'never' : new Date(stored.expiresAt).toISOString();
      }
    } catch (error) {
      expiryLookupFailed = true;
      logger.debug('[compact] No stored user key expiry for the compaction endpoint', error);
    }
  }
  /** Whether the call really left the conversation's endpoint: an unresolvable
   *  `summarization.provider` falls back to it, and the request's own marker is
   *  then the right one after all. */
  const crossEndpoint = !isSameEndpoint(endpoint, agentEndpoint);
  /**
   * Shallow clone: `getOptions` reads `body.key`, and the caller's request must
   * not be mutated for the rest of its lifetime.
   *
   * On a cross-endpoint summarizer the marker is replaced unconditionally, and
   * CLEARED when the lookup failed or found nothing. Falling through to the
   * conversation's own marker would have the initializer validate the target's
   * stored credential against an unrelated endpoint's expiry: a marker of
   * `never` would let an expired target key through.
   */
  const keyMarker =
    crossEndpoint && expiryLookupFailed ? UNVERIFIABLE_KEY_EXPIRY : (keyExpiry ?? undefined);
  const optionsReq = (
    crossEndpoint || keyExpiry != null
      ? { ...req, body: { ...(req.body ?? {}), key: keyMarker } }
      : req
  ) as ServerRequest;

  const options = await providerConfig.getOptions({
    req: optionsReq,
    endpoint,
    /** The run's generation settings belong to the conversation's OWN provider.
     *  Carrying an OpenAI `frequency_penalty` or `response_format` into a
     *  configured Google summarizer spreads unsupported fields into its client
     *  config, and an inherited output cap would size the call against a
     *  parameter the target never honors. A redirected summarizer starts from
     *  its endpoint defaults, with `summarization.parameters` applied below. */
    model_parameters: crossEndpoint ? { model } : { ...(agent.model_parameters ?? {}), model },
    db,
  });

  const llmConfig = options.llmConfig as MaybeAzureConfig | undefined;
  let provider = (options.provider ??
    providerConfig.overrideProvider ??
    agent.provider) as Providers;
  if (endpoint === EModelEndpoint.azureOpenAI && llmConfig?.azureOpenAIApiInstanceName == null) {
    provider = Providers.OPENAI;
  } else if (
    endpoint === EModelEndpoint.azureOpenAI &&
    llmConfig?.azureOpenAIApiInstanceName != null &&
    provider !== Providers.AZURE
  ) {
    provider = Providers.AZURE;
  }

  /**
   * Kept whole, unlike the title/label paths: compaction runs the SAME model
   * the conversation runs on unless an admin pointed it elsewhere, so its
   * generation options (proxy carriers, output caps, reasoning settings) are
   * the correct ones, including `streaming`, which must stay as the endpoint
   * resolved it (Anthropic rejects a non-streaming request whose output cap
   * could take over ten minutes).
   */
  const clientOptions = { ...(llmConfig ?? {}) } as MaybeAzureConfig;
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions as OpenAIConfiguration;
  }

  /**
   * Admin summarization overrides win over the conversation's own generation
   * settings, exactly as `buildSummarizationClientConfig` applies them on the
   * automatic path: `parameters` are spread on top, and `maxSummaryTokens`
   * replaces the run's output cap under the provider's own key.
   */
  const { llmParams, maxSummaryTokens } = separateSummarizationParameters(
    summarization?.parameters,
  );
  /** `configuration` carries the endpoint's routing and auth (baseURL,
   *  defaultHeaders, guarded fetch options). A shallow assign would let an
   *  unrelated override such as `defaultQuery` drop them and send the
   *  compaction to the wrong backend, so it is merged the way the automatic
   *  path's `mergeParameters` merges it. */
  /** `model`/`modelName` are ROUTING, not generation settings: `clientOptions`
   *  is what `initializeModel` invokes, while sizing, the balance gate, billing,
   *  headers and the persisted metadata all read the resolved `model`. Letting
   *  `parameters` set them would run one model and charge for another, so
   *  `summarization.model` stays the only way to redirect. */
  const {
    configuration: paramConfiguration,
    model: _paramModel,
    modelName: _paramModelName,
    ...topLevelParams
  } = llmParams as Record<string, unknown>;
  Object.assign(clientOptions, topLevelParams);
  if (isPlainObject(paramConfiguration)) {
    clientOptions.configuration = {
      ...(clientOptions.configuration ?? {}),
      ...paramConfiguration,
    } as OpenAIConfiguration;
  }
  const effectiveMaxSummaryTokens = maxSummaryTokens ?? summarization?.maxSummaryTokens;
  if (effectiveMaxSummaryTokens != null && effectiveMaxSummaryTokens > 0) {
    applyOutputCap(clientOptions, provider, effectiveMaxSummaryTokens, model ?? '');
  }

  /** The whole request body, not just the generated ids: a custom endpoint
   *  header may template any request field (`{{LIBRECHAT_BODY_MODEL}}`, `spec`,
   *  an endpoint parameter), and resolving against the ids alone strips it.
   *  The resolved model and endpoint override the conversation's, so a gateway
   *  header names the deployment this call actually goes to. */
  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user),
    body: {
      ...((req.body as Record<string, unknown>) ?? {}),
      ...ids,
      endpoint,
      ...(model != null ? { model } : {}),
    } as RequestBody,
  });

  return {
    provider,
    endpoint,
    tokenLookupEndpoint: resolveEndpointKey(endpoint, providerConfig.customEndpointConfig != null),
    usesRunModel: !crossEndpoint && model === runModel,
    replaysReasoningContent: shouldReplayReasoningContent({
      provider,
      model,
      includeReasoningHistory:
        providerConfig.customEndpointConfig?.customParams?.includeReasoningHistory,
    }),
    model,
    clientOptions,
    endpointTokenConfig: options.endpointTokenConfig,
    /** Both read the FINAL target, not the configured intent: an unresolvable
     *  `summarization.provider` falls back to the agent's own endpoint and
     *  clears the model override, and the call really is the run's own after
     *  that. */
    sameEndpoint: !crossEndpoint,
  };
}

/**
 * Fraction of the summarizer's context window the transcript may occupy. The
 * rest is headroom for the checkpoint prompt, the summary itself, and the
 * provider's own accounting of a prompt this module can only estimate.
 */
const TRANSCRIPT_BUDGET_RATIO = 0.7;

/** Assumed window when the summarizer's model is unknown to the token map. */
const FALLBACK_CONTEXT_TOKENS = 32_768;

/** Room kept for the running checkpoint when the model declares no output cap. */
const DEFAULT_CHECKPOINT_RESERVE = 4096;

/** Below this, no chunk size makes the request fit and compaction is refused. */
const MIN_CHUNK_BUDGET_TOKENS = 1024;

/** Guard against a runaway number of model calls on an enormous branch. */
const MAX_COMPACTION_PASSES = 8;

/**
 * Splits the transcript into consecutive chunks that each fit the summarizer's
 * context window.
 *
 * A normal turn is pruned by the SDK before it reaches the provider; this path
 * rebuilds the whole root-to-leaf branch itself, so an unbounded prompt gets a
 * context-length error exactly when compaction is most needed. Chunking rather
 * than truncating is what keeps the checkpoint complete: every chunk is folded
 * into the running checkpoint in turn, so no turn is dropped unsummarized.
 *
 * Chunks start at human messages so tool_call and tool_result pairs are never
 * split, the same rule the SDK's recency boundary follows. A single turn larger
 * than the budget becomes its own oversized chunk; the provider's own limits
 * govern from there rather than this module silently discarding it.
 */
async function measureTranscript(messages: BaseMessage[]): Promise<MeasuredTranscript> {
  const counts: number[] = [];
  let total = 0;
  for (const message of messages) {
    const size = await countMessageTokens(message);
    counts.push(size);
    total += size;
  }
  return { messages, counts, total };
}

/** Per-message token sizes, measured once and reused across budget attempts. */
interface MeasuredTranscript {
  messages: BaseMessage[];
  counts: number[];
  total: number;
}

function chunkTranscript(
  { messages, counts, total }: MeasuredTranscript,
  budget: number,
  startIndex = 0,
): BaseMessage[][] {
  if (startIndex >= messages.length) {
    return [];
  }
  let remaining = total;
  for (let i = 0; i < startIndex; i++) {
    remaining -= counts[i];
  }
  if (remaining <= budget) {
    return [messages.slice(startIndex)];
  }

  const chunks: BaseMessage[][] = [];
  let start = startIndex;
  let running = 0;
  for (let i = startIndex; i < messages.length; i++) {
    const wouldExceed = running + counts[i] > budget;
    /** Only break at a turn boundary, and never emit an empty chunk. */
    if (wouldExceed && i > start && messages[i].getType() === 'human') {
      chunks.push(messages.slice(start, i));
      start = i;
      running = 0;
    }
    running += counts[i];
  }
  chunks.push(messages.slice(start));
  return chunks;
}

/**
 * Size of one message as the provider will see it. `formatAgentMessages` puts
 * an assistant turn's tool name and arguments in `tool_calls`, outside
 * `content`, so counting content alone lets a tool-heavy branch contribute
 * almost nothing to chunking, the balance gate and the billing fallback.
 */
async function countMessageTokens(message: BaseMessage): Promise<number> {
  const { content } = message;
  const parts: string[] = [typeof content === 'string' ? content : JSON.stringify(content)];
  const toolCalls = (message as AIMessage).tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    parts.push(JSON.stringify(toolCalls));
  }
  const toolCallId = (message as unknown as { tool_call_id?: string }).tool_call_id;
  if (typeof toolCallId === 'string' && toolCallId !== '') {
    parts.push(toolCallId);
  }
  if (typeof message.name === 'string' && message.name !== '') {
    parts.push(message.name);
  }
  /** Reconstructed by `formatAgentMessages` for a target that replays it, and
   *  sent with the request, so a reasoning-heavy branch is sized short without
   *  it: chunked past the window, gated on an underestimate, and underbilled
   *  whenever the gateway omits usage. */
  const reasoning = message.additional_kwargs?.reasoning_content;
  if (typeof reasoning === 'string' && reasoning !== '') {
    parts.push(reasoning);
  }
  return countTokens(parts.join(' '));
}

/**
 * Prompt-size estimate for the pre-flight balance check. Counts the serialized
 * content of every message the provider will receive, matching how the send
 * path derives its `promptTokens` argument closely enough for a spend gate.
 */
async function countPromptTokens(messages: BaseMessage[]): Promise<number> {
  let total = 0;
  for (const message of messages) {
    total += await countMessageTokens(message);
  }
  return total;
}

function extractResponseText(message: BaseMessage | undefined): string {
  const content = message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((block) => (typeof block === 'string' ? block : ((block as { text?: string }).text ?? '')))
    .join('')
    .trim();
}

/**
 * Output tokens the request will ask for, which count against the provider's
 * combined context limit alongside the prompt. Reads the same key the client
 * options carry it under, so an inherited conversation cap is respected.
 */
/** Where `getOpenAILLMConfig` relocates an output cap it cannot send verbatim. */
const NESTED_OUTPUT_CAP_KEYS = ['max_completion_tokens', 'max_output_tokens'] as const;

/** Models whose cap `getOpenAILLMConfig` moves, because they reject `max_tokens`. */
const RELOCATED_CAP_MODEL_PATTERN = /\bgpt-[5-9](?:\.\d+)?\b/i;

/**
 * Writes an output cap where the RESOLVED config expects it.
 *
 * `getOptions` has already run by the time an admin's `maxSummaryTokens`
 * override is applied, and for a GPT-5+ model it moved the inherited cap into
 * `modelKwargs` and deleted the top-level key. Writing the override back at the
 * top level would send `max_tokens` alongside the relocated one, which those
 * models reject, and would leave the stale nested value governing the request.
 * Same decision the label and memory paths make for the same reason.
 */
function applyOutputCap(
  clientOptions: ClientOptions,
  provider: Providers,
  cap: number,
  /** The RESOLVED model, not `clientOptions.model`: Azure overwrites that with
   *  the deployment name after the relocation has already happened, so reading
   *  it back misses a GPT-5 deployment whose name does not say so. */
  model: string,
): void {
  const options = clientOptions as Record<string, unknown>;
  if (!RELOCATED_CAP_MODEL_PATTERN.test(model)) {
    options[getMaxOutputTokensKey(provider)] = cap;
    return;
  }
  const relocatedKey =
    options.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
  const modelKwargs = isPlainObject(options.modelKwargs) ? { ...options.modelKwargs } : {};
  for (const key of NESTED_OUTPUT_CAP_KEYS) {
    delete modelKwargs[key];
  }
  modelKwargs[relocatedKey] = cap;
  options.modelKwargs = modelKwargs;
  delete options[getMaxOutputTokensKey(provider)];
}

function resolveOutputReserve(clientOptions: ClientOptions, provider: Providers): number {
  const options = clientOptions as Record<string, unknown>;
  const configured = options[getMaxOutputTokensKey(provider)];
  if (typeof configured === 'number' && configured > 0) {
    return configured;
  }
  /**
   * A GPT-5+ model has its `maxTokens` MOVED into `modelKwargs` and the
   * top-level key deleted, so reading only the provider's key reports no cap at
   * all and sizes chunks as though the response were free. The relocated value
   * is the same cap and reserves the same room.
   */
  const modelKwargs = options.modelKwargs;
  if (!isPlainObject(modelKwargs)) {
    return 0;
  }
  for (const key of NESTED_OUTPUT_CAP_KEYS) {
    const nested = modelKwargs[key];
    if (typeof nested === 'number' && nested > 0) {
      return nested;
    }
  }
  return 0;
}

function extractUsage(
  message: AIMessage | undefined,
  model: string | undefined,
  provider: string,
): CompactionUsage | undefined {
  const usage = message?.usage_metadata;
  if (!usage) {
    return undefined;
  }
  return {
    model,
    provider,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    ...(usage.input_token_details != null
      ? {
          input_token_details: {
            cache_read: usage.input_token_details.cache_read,
            cache_creation: usage.input_token_details.cache_creation,
          },
        }
      : {}),
  };
}

/**
 * Streams the compaction call and folds the chunks back into one message,
 * mirroring how the SDK's summarization detour invokes its model. Streaming is
 * not optional here: Anthropic refuses a non-streaming request whose output cap
 * allows a run longer than ten minutes, which a conversation-sized cap does.
 * Falls back to a plain invoke for a runnable that cannot stream.
 */
async function invokeCompactionModel(
  llm: Runnable,
  messages: BaseMessage[],
  config: RunnableConfig & { runName?: string },
  /** False only when the resolved config asked for it: a LangChain runnable
   *  always exposes `stream()`, so a gateway that rejects streamed requests is
   *  reachable only through the endpoint's own `streaming: false`. */
  streaming = true,
): Promise<AIMessage | undefined> {
  if (streaming === false || typeof llm.stream !== 'function') {
    return (await llm.invoke(messages, config)) as AIMessage;
  }
  const stream = await llm.stream(messages, config);
  let aggregate: AIMessageChunk | undefined;
  try {
    for await (const chunk of stream) {
      const next = chunk as AIMessageChunk;
      aggregate = aggregate == null ? next : aggregate.concat(next);
    }
  } catch (error) {
    /** A client that defers a 401, a rate limit, or a refused connection until
     *  the iterator's first `next()` surfaces it here having produced nothing.
     *  Only an aggregate proves the provider did work, so the wrapper (which is
     *  what makes the caller bill the pass) is raised only once one exists. */
    if (aggregate == null) {
      throw error;
    }
    /** Chunks that already arrived are provider work the user must be charged
     *  for; a gateway interruption partway through is not a free call. The
     *  partial aggregate rides out with the failure so the caller can bill it. */
    throw new StreamInterruptedError(error, aggregate);
  }
  return aggregate;
}

export interface CompactionResult {
  /** The summary content part to persist on the compaction message. */
  summary: SummaryContentPart;
  /** Message count that the summary replaces. */
  messagesCompacted: number;
  /** One entry per provider call, never summed: `recordCollectedUsage` derives
   *  the long-context pricing tier from each record's own input count. */
  passes: CompactionPass[];
  /** Rates of the endpoint the call actually ran on, for the transaction. */
  endpointTokenConfig?: EndpointTokenConfig;
  /** Provider and model the call ran on, for that estimated transaction. */
  provider: string;
  model?: string;
}

export interface CompactConversationParams {
  req: ServerRequest;
  agent: CompactionAgent;
  /** Branch messages, oldest first. */
  branch: TMessage[];
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: CompactionDbMethods;
  /** Owner-scoped file lookup for attachment hydration. Omitted in unit tests
   *  and for callers whose branch carries no attachments. */
  getFiles?: GetFilesFn;
  /** Resolves the agents whose parts appear in the branch, so parallel replies
   *  keep their attribution. Omitted and the mapper still strips routing
   *  metadata, just without labels. */
  getAgent?: GetAgentFn;
  /** Resolves historical skill bodies; omitted when skills are disabled. */
  skills?: CompactionSkillDeps;
  signal?: AbortSignal;
  /**
   * Runs after the prompt is assembled and the model resolved, but BEFORE the
   * provider is contacted. The host uses it for the same pre-flight balance
   * check `BaseClient` runs on a normal turn; throwing aborts the compaction
   * without spending.
   */
  beforeInvoke?: (estimate: {
    promptTokens: number;
    /** Estimated input of each pass, in order. The premium long-context tiers
     *  are keyed off ONE call's input, which the total cannot express. */
    passPromptTokens: number[];
    model?: string;
    provider: string;
    /** The endpoint the call resolved to, which may differ from the
     *  conversation's. Prices the transaction. */
    endpoint: string;
    /** Endpoint KEY for `supportsBalanceCheck`, which indexes named custom
     *  endpoints under `custom` rather than their own name. */
    balanceEndpoint: string;
    endpointTokenConfig?: EndpointTokenConfig;
  }) => Promise<void>;
}

/** Raised when there is nothing left to compact on the active branch. */
export class NothingToCompactError extends Error {
  constructor() {
    super('No messages to compact');
    this.name = 'NothingToCompactError';
  }
}

/** A stream that produced output before failing. Carries what arrived, and is
 *  raised ONLY when something did: its presence is the caller's evidence that
 *  the failed pass is billable. */
class StreamInterruptedError extends Error {
  readonly cause: unknown;
  readonly partial: AIMessageChunk;
  constructor(cause: unknown, partial: AIMessageChunk) {
    super(cause instanceof Error ? cause.message : 'Compaction stream interrupted');
    this.name = 'StreamInterruptedError';
    this.cause = cause;
    this.partial = partial;
  }
}

/**
 * Raised when the summarizer's window cannot fit a request at all: its output
 * cap and the carried checkpoint already consume the context, so no chunk size
 * would help. Naming it beats sending requests that are certain to be rejected.
 */
export class UnworkableContextError extends Error {
  readonly contextWindow: number;
  readonly outputReserve: number;
  constructor(contextWindow: number, outputReserve: number) {
    super(
      `The summarization model's ${contextWindow}-token window cannot fit a compaction request with a ${outputReserve}-token output cap`,
    );
    this.name = 'UnworkableContextError';
    this.contextWindow = contextWindow;
    this.outputReserve = outputReserve;
  }
}

/**
 * Raised when a branch needs more consolidation passes than the cap allows.
 * Refusing is deliberate: a checkpoint built from part of the branch would
 * still replace all of it in every later prompt, losing the rest silently.
 */
export class TranscriptTooLargeError extends Error {
  readonly passes: number;
  readonly maxPasses: number;
  constructor(passes: number, maxPasses: number) {
    super(`Conversation needs ${passes} compaction passes, more than the ${maxPasses} allowed`);
    this.name = 'TranscriptTooLargeError';
    this.passes = passes;
    this.maxPasses = maxPasses;
  }
}

/**
 * A compaction failure that nevertheless completed provider calls. The host
 * bills the carried usage before surfacing it, so a partial multi-pass run is
 * never silently free.
 */
export class BilledCompactionError extends Error {
  /** One entry per COMPLETED pass; pricing tiers are derived per record. */
  readonly passes: CompactionPass[];
  readonly model?: string;
  readonly provider?: string;
  readonly endpointTokenConfig?: EndpointTokenConfig;
  constructor(details: {
    passes?: CompactionPass[];
    model?: string;
    provider?: string;
    endpointTokenConfig?: EndpointTokenConfig;
    message?: string;
  }) {
    super(details.message ?? 'Compaction produced empty output');
    this.name = 'BilledCompactionError';
    this.passes = details.passes ?? [];
    this.model = details.model;
    this.provider = details.provider;
    this.endpointTokenConfig = details.endpointTokenConfig;
  }
}

/** The provider answered a pass with no usable text. */
export class EmptyCompactionError extends BilledCompactionError {
  constructor(details: ConstructorParameters<typeof BilledCompactionError>[0]) {
    super(details);
    this.name = 'EmptyCompactionError';
  }
}

/** A pass threw after earlier passes had already spent. */
export class PartialCompactionError extends BilledCompactionError {
  readonly cause: unknown;
  constructor(
    details: ConstructorParameters<typeof BilledCompactionError>[0] & { cause: unknown },
  ) {
    super(details);
    this.name = 'PartialCompactionError';
    this.cause = details.cause;
  }
}

/**
 * Compacts a conversation branch on demand.
 *
 * The branch is formatted through the SDK's `formatAgentMessages`, so an
 * earlier summary already truncates the payload and is handed back as the
 * prior checkpoint to consolidate. The returned content part carries the same
 * shape the automatic detour persists, which is what lets `formatAgentMessages`
 * treat it as the boundary on every later turn.
 */
export async function compactConversation({
  req,
  agent,
  branch,
  ids,
  db,
  getFiles,
  getAgent,
  skills,
  signal,
  beforeInvoke,
}: CompactConversationParams): Promise<CompactionResult> {
  /** Resolved BEFORE the branch is formatted: whether the target replays
   *  `reasoning_content` decides how the history has to be reconstructed. */
  const {
    provider,
    endpoint,
    tokenLookupEndpoint,
    model,
    clientOptions,
    endpointTokenConfig,
    sameEndpoint,
    usesRunModel,
    replaysReasoningContent,
  } = await resolveCompactionModel({ req, agent, ids, db });

  /**
   * Everything before the newest checkpoint is discarded by
   * `formatAgentMessages`, so enriching it would reload and tokenize documents
   * and query agents that can never reach the summarizer. Worse, a transient
   * lookup failure for that dead history would abort a compaction that does not
   * depend on it.
   */
  const retained = retainedSegment(branch);
  /** `resendFiles: false` means the user turned off re-sending previously
   *  uploaded files, and the normal history path returns before loading any.
   *  Re-inlining them here would send those documents again, possibly to a
   *  different configured summarization provider. */
  const { contextByMessageId, contextBySteerPart } =
    agent.resendFiles === false
      ? { contextByMessageId: new Map<string, string>(), contextBySteerPart: new Map() }
      : await hydrateAttachments(retained, req, getFiles, agent.fileTokenLimit);
  const agentConfigs = await resolveHistoryAgents(retained, getAgent);
  const payload = stripActivityLabelParts(
    toPayload(
      retained,
      contextByMessageId,
      contextBySteerPart,
      createMultiAgentMapper(agent as Agent, agentConfigs),
    ),
  );
  /**
   * A manually invoked skill leaves only its tool call in history, not the
   * SKILL.md body the model actually received. Resolving it here lets the
   * checkpoint record the skill's constraints, which the boundary is about to
   * make unreconstructable from the messages themselves.
   */
  const skillBodies = await resolveInvokedSkillBodies(payload, skills);
  const { messages, summary: priorSummary } = formatAgentMessages(
    payload,
    undefined,
    undefined,
    skillBodies,
    /** A DeepSeek reasoning model, or a custom endpoint that opted in, REQUIRES
     *  the hidden `reasoning_content` reconstructed onto historical tool-call
     *  messages, exactly as the normal run does before sending them. */
    replaysReasoningContent ? { preserveReasoningContent: true } : undefined,
  );
  if (messages.length === 0) {
    throw new NothingToCompactError();
  }

  const appConfig = req.config as AppConfig | undefined;
  const summarization = appConfig?.summarization as SummarizationConfig | undefined;
  const promptText = isNonEmptyString(summarization?.prompt)
    ? summarization.prompt
    : DEFAULT_COMPACTION_PROMPT;
  const updatePromptText = isNonEmptyString(summarization?.updatePrompt)
    ? summarization.updatePrompt
    : DEFAULT_COMPACTION_UPDATE_PROMPT;

  const llm = initializeModel({ provider, clientOptions });

  /** Resolved endpoint, not the SDK provider name: `providerEndpointMap` covers
   *  only four endpoints, so mapping through it sends `undefined` for Google
   *  and falls back to a tiny window. Named custom endpoints resolve to
   *  `custom`, where their models actually live in the token map. */
  /** The conversation's own limit describes the model the CONVERSATION runs on.
   *  A configured summarizer is a different model with its own window, so the
   *  override applies only when compaction stayed on the run's target. */
  const configuredWindow =
    usesRunModel && agent.maxContextTokens != null && agent.maxContextTokens > 0
      ? agent.maxContextTokens
      : undefined;
  const contextWindow =
    configuredWindow ??
    getModelMaxTokens(model ?? '', tokenLookupEndpoint, endpointTokenConfig) ??
    FALLBACK_CONTEXT_TOKENS;
  /** The request asks for output too: a chunk sized against the whole window
   *  plus an inherited output cap exceeds the provider's combined limit. */
  const outputReserve = resolveOutputReserve(clientOptions, provider);
  /** Later passes send the UPDATE prompt, which an administrator may configure
   *  longer than the initial one; reserving only the initial form lets a
   *  supposedly valid pass overflow after an earlier one has been billed. */
  const instructionReserve = Math.max(
    await countTokens(promptText),
    await countTokens(updatePromptText),
  );
  /** Passes after the first also carry the running checkpoint as input, and a
   *  checkpoint is at most one full model output. Reserved unconditionally
   *  because the pass count is only known once the budget has chunked. */
  const checkpointReserve = outputReserve > 0 ? outputReserve : DEFAULT_CHECKPOINT_RESERVE;
  /** The FIRST pass carries the existing checkpoint, and that one was written
   *  by whatever summarizer ran last: an administrator who lowered
   *  `maxSummaryTokens` or moved to a smaller model leaves a prior checkpoint
   *  larger than the current output cap, and sizing to the cap alone would
   *  overflow the window on a pass the budget had judged valid. */
  const priorSummaryTokens = priorSummary?.text ? await countTokens(priorSummary.text) : 0;
  const budgetFor = (carried: number) =>
    Math.floor(
      (contextWindow - outputReserve - instructionReserve - carried) * TRANSCRIPT_BUDGET_RATIO,
    );
  /** A floor here would hand the provider a request that cannot fit however
   *  small the chunk is: the output cap and carried checkpoint alone already
   *  consume the window. Refusing names the real problem instead. */
  const refuseIfUnworkable = (budget: number) => {
    if (budget < MIN_CHUNK_BUDGET_TOKENS) {
      throw new UnworkableContextError(contextWindow, outputReserve);
    }
  };
  /**
   * Sized for ONE pass first. A running checkpoint only exists from the second
   * pass onward, so reserving for it up front refuses transcripts that fit
   * comfortably: an 8K window with a 4K output cap has no budget left at all
   * once a checkpoint it will never produce is subtracted too.
   */
  const singlePassBudget = budgetFor(priorSummaryTokens);
  refuseIfUnworkable(singlePassBudget);
  /** Measured once: re-chunking below must not re-tokenize the branch. */
  const measured = await measureTranscript(messages as BaseMessage[]);
  let chunks = chunkTranscript(measured, singlePassBudget);
  if (chunks.length > 1) {
    /** It does not fit in one pass after all, so every pass but the first has
     *  to carry the running checkpoint as well. Only the REMAINDER is
     *  re-chunked: the first pass still carries no generated checkpoint, and
     *  shrinking it too would spend an extra provider call, or refuse a branch
     *  that fits, once the pass count approaches its cap. */
    const multiPassBudget = budgetFor(Math.max(checkpointReserve, priorSummaryTokens));
    refuseIfUnworkable(multiPassBudget);
    const [firstChunk] = chunks;
    chunks = [firstChunk, ...chunkTranscript(measured, multiPassBudget, firstChunk.length)];
  }
  if (chunks.length > MAX_COMPACTION_PASSES) {
    /** Refuse rather than drop: a checkpoint that silently omitted the oldest
     *  turns would still replace them in every later prompt. */
    throw new TranscriptTooLargeError(chunks.length, MAX_COMPACTION_PASSES);
  }

  /**
   * Estimated PER PASS, so the balance gate covers the whole operation rather
   * than its first call and can still price one call at its own rate: premium
   * long-context tiers are keyed off a single request's input, so a summed
   * figure alone tells the gate nothing about which tier applies. The
   * instruction rides on every pass; pass one carries any prior checkpoint
   * being consolidated, and every pass after it the running one.
   */
  const passPromptTokens: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const carried = i === 0 ? priorSummaryTokens : checkpointReserve;
    passPromptTokens.push(instructionReserve + carried + (await countPromptTokens(chunks[i])));
  }
  const estimatedPromptTokens = passPromptTokens.reduce((total, pass) => total + pass, 0);
  if (beforeInvoke) {
    await beforeInvoke({
      promptTokens: estimatedPromptTokens,
      passPromptTokens,
      model,
      provider,
      endpoint,
      balanceEndpoint: tokenLookupEndpoint,
      endpointTokenConfig,
    });
  }

  const timeout = AbortSignal.timeout(COMPACTION_TIMEOUT_MS);
  const abortSignal =
    signal != null && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : timeout;

  /**
   * Each chunk is folded into the running checkpoint through the SAME update
   * prompt a second manual compaction uses, so an over-window branch is
   * consolidated rather than truncated.
   */
  let text = '';
  /**
   * One entry per completed pass, never summed. `recordCollectedUsage` derives
   * a model's long-context pricing tier from each record's input count, so
   * collapsing four small calls into one aggregate can push a cheap pass over a
   * premium threshold and charge it at the higher rate. Each entry keeps BOTH
   * the provider's record (when it sent one) and the local count, so a gateway
   * that reports usage for some calls and not others is billed correctly for
   * every one rather than all-or-nothing.
   */
  const passes: CompactionPass[] = [];
  const billingDetails = () => ({ passes: [...passes], model, provider, endpointTokenConfig });

  for (const chunk of chunks) {
    const instruction = buildSummarizationInstruction(
      promptText,
      updatePromptText,
      text || priorSummary?.text,
    );
    const passMessages = [...chunk, new HumanMessage(instruction)] as BaseMessage[];
    const passInputTokens = await countPromptTokens(passMessages);

    let response: AIMessage | undefined;
    try {
      response = await invokeCompactionModel(
        llm,
        passMessages,
        {
          signal: abortSignal,
          runName: 'CompactRun',
          configurable: {
            thread_id: ids.conversationId,
            user_id: req.user?.id,
          },
        },
        (clientOptions as { streaming?: boolean }).streaming !== false,
      );
    } catch (error) {
      /** A rejected call (bad credential, rate limit) produced no provider
       *  work, so its prompt is not counted, whether it was refused outright or
       *  deferred to the stream's first read. A stream that failed AFTER
       *  emitting is real spend and is recorded before rethrowing. */
      if (error instanceof StreamInterruptedError) {
        passes.push({
          usage: extractUsage(error.partial as AIMessage, model, provider),
          counted: {
            input_tokens: passInputTokens,
            output_tokens: await countTokens(extractResponseText(error.partial)),
          },
        });
      }
      throw new PartialCompactionError({
        ...billingDetails(),
        cause: error instanceof StreamInterruptedError ? error.cause : error,
        message: error instanceof Error ? error.message : 'Compaction pass failed',
      });
    }

    const passText = extractResponseText(response);
    passes.push({
      usage: extractUsage(response, model, provider),
      counted: { input_tokens: passInputTokens, output_tokens: await countTokens(passText) },
    });
    /** An empty pass means THIS chunk was never folded in, and a later pass
     *  would still produce a boundary that discards it. Refuse rather than
     *  persist a checkpoint that silently omits part of the branch. */
    if (passText === '') {
      throw new EmptyCompactionError(billingDetails());
    }
    text = passText;
  }

  /**
   * Sized from the PERSISTED text, never the provider's `output_tokens`. On a
   * reasoning summarizer those two diverge by the hidden thinking, which is
   * billed but never written into the checkpoint; using it here would make
   * every later context calculation reserve room for tokens that are not sent.
   * Provider output usage stays exclusively a billing input.
   */
  const tokenCount = await countTokens(buildSummaryCarrierText(text));

  logger.debug('[compact] Compaction complete', {
    provider,
    model,
    sameEndpoint,
    tokenCount,
    messagesCompacted: messages.length,
    hasPriorSummary: (priorSummary?.text?.trim() ?? '') !== '',
    hasEndpointTokenConfig: endpointTokenConfig != null,
  });

  return {
    messagesCompacted: messages.length,
    passes,
    endpointTokenConfig,
    provider,
    model,
    summary: {
      type: ContentTypes.SUMMARY,
      initiatedBy: 'user',
      content: [{ type: ContentTypes.TEXT, text }],
      tokenCount,
      model,
      provider,
      createdAt: new Date().toISOString(),
    },
  };
}
