import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes, EModelEndpoint, FileSources } from 'librechat-data-provider';
import {
  Providers,
  HumanMessage,
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
import type { EndpointDbMethods, OpenAIConfiguration, RequestBody, ServerRequest } from '~/types';
import type { FormattedMessageWithContent } from '~/agents/client';
import type { EndpointTokenConfig } from '~/types/tokens';
import type { OwnerFileFilter } from '~/files/history';
import { createMultiAgentMapper, prependFileContext, prependQuotes } from '~/agents/client';
import { buildOwnerFileFilter, collectHistoricalFileIds } from '~/files/history';
import { stripActivityLabelParts } from '~/agents/activityLabels/wiring';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveConfigHeaders } from '~/utils/headers';
import { extractFileContext } from '~/files/context';
import { getModelMaxTokens } from '~/utils/tokens';
import { countTokens } from '~/utils/tokenizer';
import { createSafeUser } from '~/utils/env';

/**
 * Matches the agents SDK's summary accounting: the persisted summary is
 * re-injected wrapped in a system/human carrier, so its stored token count has
 * to include that wrapper or every later budget read undercounts it.
 */
const SUMMARY_WRAPPER_OVERHEAD_TOKENS = 33;

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

export interface CompactionModel {
  provider: Providers;
  /** The endpoint the call resolved to, for token-window lookups that key on
   *  endpoints rather than SDK provider names. */
  endpoint: string;
  model?: string;
  clientOptions: ClientOptions;
  endpointTokenConfig?: EndpointTokenConfig;
  /** True when compaction resolved to the agent's OWN endpoint, which decides
   *  whether `endpointTokenConfig` is authoritative for pricing. */
  sameEndpoint: boolean;
}

/** Minimal agent view compaction needs: provider, endpoint, and model. */
export interface CompactionAgent {
  provider: string;
  model?: string | null;
  /** Set by `initializeAgent`; absent on a freshly loaded agent document, where
   *  `provider` already names the endpoint. */
  endpoint?: string | null;
  model_parameters?: Partial<AgentModelParameters> & { model?: string };
}

export interface ResolveCompactionModelParams {
  req: ServerRequest;
  agent: CompactionAgent;
  /** Request-scoped ids for header placeholder resolution. */
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: EndpointDbMethods;
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
 * Rebuilds the document text an attachment-bearing turn contributed, the way
 * `BaseClient.addPreviousAttachments` does before a normal turn.
 *
 * Without it these raw database rows carry only file references, so a branch
 * built around an uploaded document would be replaced by a summary that never
 * saw the document. The lookup is owner-scoped through `buildOwnerFileFilter`,
 * so a forged reference cannot pull another user's file into the transcript.
 */
async function hydrateAttachments(
  branch: TMessage[],
  req: ServerRequest,
  getFiles?: GetFilesFn,
): Promise<Map<string, string>> {
  const contextByMessageId = new Map<string, string>();
  if (!getFiles) {
    return contextByMessageId;
  }
  const filter = buildOwnerFileFilter(collectHistoricalFileIds(branch), req.user);
  if (!filter) {
    return contextByMessageId;
  }
  const files = (await getFiles(filter)) ?? [];
  const byId = new Map(files.map((file) => [file.file_id, file]));
  const seen = new Set<string>();
  for (const message of branch) {
    const attachments: IMongoFile[] = [];
    for (const ref of message.files ?? []) {
      if (!ref?.file_id || seen.has(ref.file_id)) {
        continue;
      }
      const file = byId.get(ref.file_id);
      if (file) {
        attachments.push(file);
        seen.add(ref.file_id);
      }
    }
    if (attachments.length === 0) {
      continue;
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
    const media = attachments.filter((file) => !isInlinedTextSource(file));
    const manifest =
      media.length > 0
        ? `[Attachments: ${media
            .map((file) => `${file.filename ?? 'file'} (${file.type ?? 'unknown type'})`)
            .join(', ')}]`
        : '';
    const combined = [fileContext, manifest].filter(Boolean).join('\n\n');
    if (combined) {
      contextByMessageId.set(message.messageId, combined);
    }
  }
  return contextByMessageId;
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
function toPayload(
  branch: TMessage[],
  fileContextByMessageId: Map<string, string>,
  mapMultiAgent: (message: TMessage) => TMessage,
): Array<Partial<TMessage>> {
  return branch.map((source) => {
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

  const configuredProvider = summarization?.provider;
  const targetsOtherEndpoint =
    isNonEmptyString(configuredProvider) &&
    normalizeEndpointName(configuredProvider) !== normalizeEndpointName(agentEndpoint);
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
    }
  }

  const runModel = agent.model_parameters?.model ?? agent.model ?? undefined;
  const model = isNonEmptyString(summarization?.model) ? summarization.model : runModel;

  const options = await providerConfig.getOptions({
    req,
    endpoint,
    model_parameters: { ...(agent.model_parameters ?? {}), model },
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
  Object.assign(clientOptions, llmParams);
  const effectiveMaxSummaryTokens = maxSummaryTokens ?? summarization?.maxSummaryTokens;
  if (effectiveMaxSummaryTokens != null && effectiveMaxSummaryTokens > 0) {
    (clientOptions as Record<string, unknown>)[getMaxOutputTokensKey(provider)] =
      effectiveMaxSummaryTokens;
  }

  /** The whole request body, not just the generated ids: a custom endpoint
   *  header may template any request field (`{{LIBRECHAT_BODY_MODEL}}`, `spec`,
   *  an endpoint parameter), and resolving against the ids alone strips it. */
  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user),
    body: { ...((req.body as Record<string, unknown>) ?? {}), ...ids } as RequestBody,
  });

  return {
    provider,
    endpoint,
    model,
    clientOptions,
    endpointTokenConfig: options.endpointTokenConfig,
    sameEndpoint: !targetsOtherEndpoint,
  };
}

/**
 * Pairs the configured compaction prompt with any prior summary, so a second
 * compaction consolidates rather than restarting from an empty checkpoint.
 */
export function buildCompactionInstruction(
  promptText: string,
  updatePromptText: string,
  priorSummaryText?: string,
): string {
  const prior = priorSummaryText?.trim() ?? '';
  if (prior === '') {
    return promptText;
  }
  return `${updatePromptText}\n\n<previous-summary>\n${prior}\n</previous-summary>`;
}

/**
 * Fraction of the summarizer's context window the transcript may occupy. The
 * rest is headroom for the checkpoint prompt, the summary itself, and the
 * provider's own accounting of a prompt this module can only estimate.
 */
const TRANSCRIPT_BUDGET_RATIO = 0.7;

/** Assumed window when the summarizer's model is unknown to the token map. */
const FALLBACK_CONTEXT_TOKENS = 32_768;

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
async function chunkTranscript(messages: BaseMessage[], budget: number): Promise<BaseMessage[][]> {
  if (messages.length === 0) {
    return [];
  }
  const counts: number[] = [];
  let total = 0;
  for (const message of messages) {
    const size = await countMessageTokens(message);
    counts.push(size);
    total += size;
  }
  if (total <= budget) {
    return [messages];
  }

  const chunks: BaseMessage[][] = [];
  let start = 0;
  let running = 0;
  for (let i = 0; i < messages.length; i++) {
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

async function countMessageTokens(message: BaseMessage): Promise<number> {
  const { content } = message;
  return countTokens(typeof content === 'string' ? content : JSON.stringify(content));
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

/** Adds one pass's reported usage into the running total across passes. */
function mergeUsage(
  running: CompactionUsage | undefined,
  next: CompactionUsage | undefined,
): CompactionUsage | undefined {
  if (!next) {
    return running;
  }
  if (!running) {
    return next;
  }
  return {
    ...running,
    input_tokens: (running.input_tokens ?? 0) + (next.input_tokens ?? 0),
    output_tokens: (running.output_tokens ?? 0) + (next.output_tokens ?? 0),
    total_tokens:
      running.total_tokens != null || next.total_tokens != null
        ? (running.total_tokens ?? 0) + (next.total_tokens ?? 0)
        : undefined,
    input_token_details:
      running.input_token_details != null || next.input_token_details != null
        ? {
            cache_read:
              (running.input_token_details?.cache_read ?? 0) +
              (next.input_token_details?.cache_read ?? 0),
            cache_creation:
              (running.input_token_details?.cache_creation ?? 0) +
              (next.input_token_details?.cache_creation ?? 0),
          }
        : undefined,
  };
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
): Promise<AIMessage | undefined> {
  if (typeof llm.stream !== 'function') {
    return (await llm.invoke(messages, config)) as AIMessage;
  }
  const stream = await llm.stream(messages, config);
  let aggregate: AIMessageChunk | undefined;
  for await (const chunk of stream) {
    const next = chunk as AIMessageChunk;
    aggregate = aggregate == null ? next : aggregate.concat(next);
  }
  return aggregate;
}

export interface CompactionResult {
  /** The summary content part to persist on the compaction message. */
  summary: SummaryContentPart;
  /** Message count that the summary replaces. */
  messagesCompacted: number;
  usage?: CompactionUsage;
  /** Rates of the endpoint the call actually ran on, for the transaction. */
  endpointTokenConfig?: EndpointTokenConfig;
  /**
   * Locally counted prompt and completion sizes. The host bills from these
   * when the provider reported no usage at all, so an OpenAI-compatible
   * gateway that omits `usage` still produces a transaction.
   */
  estimatedUsage: { input_tokens: number; output_tokens: number };
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
  db: EndpointDbMethods;
  /** Owner-scoped file lookup for attachment hydration. Omitted in unit tests
   *  and for callers whose branch carries no attachments. */
  getFiles?: GetFilesFn;
  /** Handoff / parallel agents of the run, for added-convo content mapping. */
  agentConfigs?: Map<string, Agent>;
  signal?: AbortSignal;
  /**
   * Runs after the prompt is assembled and the model resolved, but BEFORE the
   * provider is contacted. The host uses it for the same pre-flight balance
   * check `BaseClient` runs on a normal turn; throwing aborts the compaction
   * without spending.
   */
  beforeInvoke?: (estimate: {
    promptTokens: number;
    model?: string;
    provider: string;
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
 * Raised when the provider answered with no usable text. Carries the usage it
 * reported: an empty or content-filtered completion is still a billed call, so
 * the host records it before surfacing the failure.
 */
export class EmptyCompactionError extends Error {
  readonly usage?: CompactionUsage;
  readonly model?: string;
  readonly provider?: string;
  readonly endpointTokenConfig?: EndpointTokenConfig;
  /** Local count of what was sent, so the call is billed even when the
   *  provider reported nothing at all alongside the empty completion. */
  readonly estimatedUsage: { input_tokens: number; output_tokens: number };
  constructor(details: {
    usage?: CompactionUsage;
    model?: string;
    provider?: string;
    endpointTokenConfig?: EndpointTokenConfig;
    estimatedUsage: { input_tokens: number; output_tokens: number };
  }) {
    super('Compaction produced empty output');
    this.name = 'EmptyCompactionError';
    this.usage = details.usage;
    this.model = details.model;
    this.provider = details.provider;
    this.endpointTokenConfig = details.endpointTokenConfig;
    this.estimatedUsage = details.estimatedUsage;
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
  agentConfigs,
  signal,
  beforeInvoke,
}: CompactConversationParams): Promise<CompactionResult> {
  const fileContextByMessageId = await hydrateAttachments(branch, req, getFiles);
  const { messages, summary: priorSummary } = formatAgentMessages(
    stripActivityLabelParts(
      toPayload(
        branch,
        fileContextByMessageId,
        createMultiAgentMapper(agent as Agent, agentConfigs),
      ),
    ),
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

  const { provider, endpoint, model, clientOptions, endpointTokenConfig, sameEndpoint } =
    await resolveCompactionModel({ req, agent, ids, db });

  const llm = initializeModel({ provider, clientOptions });

  /** The endpoint the call resolved to, not the SDK provider name:
   *  `providerEndpointMap` covers only four endpoints, so mapping through it
   *  would send `undefined` for Google and fall back to a tiny window. */
  const contextWindow =
    getModelMaxTokens(model ?? '', endpoint as EModelEndpoint, endpointTokenConfig) ??
    FALLBACK_CONTEXT_TOKENS;
  const chunks = await chunkTranscript(
    messages as BaseMessage[],
    Math.max(1024, Math.floor(contextWindow * TRANSCRIPT_BUDGET_RATIO)),
  );
  if (chunks.length > MAX_COMPACTION_PASSES) {
    /** Refuse rather than drop: a checkpoint that silently omitted the oldest
     *  turns would still replace them in every later prompt. */
    throw new TranscriptTooLargeError(chunks.length, MAX_COMPACTION_PASSES);
  }

  /** Sum across every pass so the balance gate covers the whole operation, not
   *  just its first call. */
  let promptTokens = 0;
  for (const chunk of chunks) {
    promptTokens += await countPromptTokens(chunk);
  }
  if (beforeInvoke) {
    await beforeInvoke({ promptTokens, model, provider, endpointTokenConfig });
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
  let usage: CompactionUsage | undefined;
  for (const chunk of chunks) {
    const instruction = buildCompactionInstruction(
      promptText,
      updatePromptText,
      text || priorSummary?.text,
    );
    const response = await invokeCompactionModel(
      llm,
      [...chunk, new HumanMessage(instruction)] as BaseMessage[],
      {
        signal: abortSignal,
        runName: 'CompactRun',
        configurable: {
          thread_id: ids.conversationId,
          user_id: req.user?.id,
        },
      },
    );
    usage = mergeUsage(usage, extractUsage(response, model, provider));
    const passText = extractResponseText(response);
    if (passText !== '') {
      text = passText;
    }
  }

  if (text === '') {
    /** Still a billed call: an OpenAI-compatible gateway may report no usage
     *  at all, so the local estimate travels with the failure. */
    throw new EmptyCompactionError({
      usage,
      model,
      provider,
      endpointTokenConfig,
      estimatedUsage: { input_tokens: promptTokens, output_tokens: 0 },
    });
  }

  /**
   * Sized from the PERSISTED text, never the provider's `output_tokens`. On a
   * reasoning summarizer those two diverge by the hidden thinking, which is
   * billed but never written into the checkpoint; using it here would make
   * every later context calculation reserve room for tokens that are not sent.
   * Provider output usage stays exclusively a billing input.
   */
  const summaryTokens = await countTokens(text);
  const tokenCount = summaryTokens + SUMMARY_WRAPPER_OVERHEAD_TOKENS;

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
    usage,
    endpointTokenConfig,
    provider,
    model,
    estimatedUsage: { input_tokens: promptTokens, output_tokens: summaryTokens },
    summary: {
      type: ContentTypes.SUMMARY,
      content: [{ type: ContentTypes.TEXT, text }],
      tokenCount,
      model,
      provider,
      createdAt: new Date().toISOString(),
    },
  };
}
