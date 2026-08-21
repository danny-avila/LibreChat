import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import {
  Providers,
  HumanMessage,
  formatMessage,
  initializeModel,
  formatAgentMessages,
  getMaxOutputTokensKey,
} from '@librechat/agents';
import type {
  TMessage,
  AgentModelParameters,
  SummarizationConfig,
  SummaryContentPart,
} from 'librechat-data-provider';
import type { BaseMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { AppConfig } from '@librechat/data-schemas';
import type { ClientOptions } from '@librechat/agents';
import type { EndpointDbMethods, OpenAIConfiguration, ServerRequest } from '~/types';
import type { FormattedMessageWithContent } from '~/agents/client';
import { stripActivityLabelParts } from '~/agents/activityLabels/wiring';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveConfigHeaders } from '~/utils/headers';
import { prependQuotes } from '~/agents/client';
import { countTokens } from '~/utils/tokenizer';
import { createSafeUser } from '~/utils/env';

/**
 * Matches the agents SDK's summary accounting: the persisted summary is
 * re-injected wrapped in a system/human carrier, so its stored token count has
 * to include that wrapper or every later budget read undercounts it.
 */
const SUMMARY_WRAPPER_OVERHEAD_TOKENS = 33;

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
  input_token_details?: { cache_read?: number; cache_creation?: number };
}

export interface CompactionModel {
  provider: Providers;
  model?: string;
  clientOptions: ClientOptions;
  endpointTokenConfig?: unknown;
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
function toPayload(branch: TMessage[]): Array<Partial<TMessage>> {
  return branch.map((message) => {
    const formatted = formatMessage({
      message: { ...message, role: message.isCreatedByUser ? 'user' : 'assistant' },
    }) as FormattedMessageWithContent;
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

  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user),
    body: ids,
  });

  return {
    provider,
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
 * Prompt-size estimate for the pre-flight balance check. Counts the serialized
 * content of every message the provider will receive, matching how the send
 * path derives its `promptTokens` argument closely enough for a spend gate.
 */
async function countPromptTokens(messages: BaseMessage[]): Promise<number> {
  let total = 0;
  for (const message of messages) {
    const { content } = message;
    total += await countTokens(typeof content === 'string' ? content : JSON.stringify(content));
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
  endpointTokenConfig?: unknown;
}

export interface CompactConversationParams {
  req: ServerRequest;
  agent: CompactionAgent;
  /** Branch messages, oldest first. */
  branch: TMessage[];
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: EndpointDbMethods;
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
    endpointTokenConfig?: unknown;
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
  signal,
  beforeInvoke,
}: CompactConversationParams): Promise<CompactionResult> {
  const { messages, summary: priorSummary } = formatAgentMessages(
    stripActivityLabelParts(toPayload(branch)),
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

  const { provider, model, clientOptions, endpointTokenConfig, sameEndpoint } =
    await resolveCompactionModel({ req, agent, ids, db });

  const instruction = buildCompactionInstruction(promptText, updatePromptText, priorSummary?.text);
  const llm = initializeModel({ provider, clientOptions });

  const promptMessages = [...messages, new HumanMessage(instruction)] as BaseMessage[];
  if (beforeInvoke) {
    await beforeInvoke({
      promptTokens: await countPromptTokens(promptMessages),
      model,
      provider,
      endpointTokenConfig,
    });
  }

  const timeout = AbortSignal.timeout(COMPACTION_TIMEOUT_MS);
  const abortSignal =
    signal != null && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : timeout;

  const response = await invokeCompactionModel(llm, promptMessages, {
    signal: abortSignal,
    runName: 'CompactRun',
    configurable: {
      thread_id: ids.conversationId,
      user_id: req.user?.id,
    },
  });

  const text = extractResponseText(response);
  if (text === '') {
    throw new Error('Compaction produced empty output');
  }

  const usage = extractUsage(response, model, provider);
  const providerOutputTokens = usage?.output_tokens ?? 0;
  const tokenCount =
    (providerOutputTokens > 0 ? providerOutputTokens : await countTokens(text)) +
    SUMMARY_WRAPPER_OVERHEAD_TOKENS;

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
