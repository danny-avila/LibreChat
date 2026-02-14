import { logger } from '@librechat/data-schemas';
import { getBufferString } from '@langchain/core/messages';
import { getChatModelClass, Providers } from '@librechat/agents';
import type {
  SummarizeRequest,
  SummarizeResult,
  ClientOptions,
  EventHandler,
} from '@librechat/agents';
import type { SummarizationConfig, SummarizationStatus } from 'librechat-data-provider';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
export type { SummarizationStatus } from 'librechat-data-provider';
import type { Runnable } from '@langchain/core/runnables';

export type SummarizationResponse = {
  text: string;
  tokenCount: number;
  model?: string;
  provider?: string;
};

export type PersistSummaryResult = {
  status: 'persisted' | 'deferred';
  targetMessageId?: string;
  targetContentIndex?: number;
};

export type SummarizeFn = (params: {
  agentId: string;
  context: BaseMessage[];
  messagesToRefine: BaseMessage[];
  remainingContextTokens: number;
  configurable?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) => Promise<SummarizationResponse>;

export type PersistSummaryFn = (params: {
  summary: SummarizationResponse;
  agentId: string;
  context: BaseMessage[];
  messagesToRefine: BaseMessage[];
  configurable?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) => Promise<PersistSummaryResult | void>;

export interface SummarizeOptions {
  summarize: SummarizeFn;
  persistSummary?: PersistSummaryFn;
  onStatusChange?: (event: SummarizationStatus) => void | Promise<void>;
}

export type SummarizationUsage = {
  type: 'summarization';
  phase?: 'single' | 'chunk' | 'merge';
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export type ResolvedSummarizationConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  parameters: Record<string, unknown>;
  prompt?: string;
};

export type GetProviderOptionsFn = (resolved: ResolvedSummarizationConfig) => Promise<{
  provider: Providers;
  clientOptions: ClientOptions;
  model: string;
}>;

const DEFAULT_SUMMARIZATION_PARTS = 2;
const DEFAULT_MIN_MESSAGES_FOR_SPLIT = 4;
const DEFAULT_MAX_INPUT_TOKENS_FOR_SINGLE_PASS = 32000;
const MERGE_SUMMARIES_PROMPT = `Merge these partial summaries into a single cohesive summary.

Preserve decisions, TODOs, open questions, constraints, and the exact user objective.`;

export function resolveSummarizationLLMConfig({
  agentId,
  globalConfig,
  agentRuntimeConfig,
}: {
  agentId: string;
  globalConfig?: SummarizationConfig;
  agentRuntimeConfig?: { provider?: string; model?: string };
}): ResolvedSummarizationConfig {
  if (!globalConfig || typeof globalConfig !== 'object') {
    return {
      enabled: false,
      parameters: {},
    };
  }

  const agentOverride = globalConfig?.agents?.[agentId];
  const parameters = {
    ...globalConfig?.parameters,
    ...agentOverride?.parameters,
  };
  const prompt = agentOverride?.prompt ?? globalConfig?.prompt;
  const provider =
    agentOverride?.provider ?? globalConfig?.provider ?? agentRuntimeConfig?.provider;
  const model = agentOverride?.model ?? globalConfig?.model ?? agentRuntimeConfig?.model;
  const hasProvider = typeof provider === 'string' && provider.trim().length > 0;
  const hasModel = typeof model === 'string' && model.trim().length > 0;
  const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;

  if (agentOverride?.enabled === false) {
    return {
      enabled: false,
      provider,
      model,
      parameters,
      prompt,
    };
  }

  return {
    enabled: globalConfig?.enabled !== false && hasProvider && hasModel && hasPrompt,
    provider,
    model,
    parameters,
    prompt,
  };
}

function extractTextContent(content: AIMessageChunk['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part.type === 'text' && 'text' in part) {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  return String(content);
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5));
}

function estimateMessagesTokens(messages: BaseMessage[]): number {
  if (messages.length === 0) {
    return 0;
  }
  return messages.reduce((sum, message) => {
    const text = getBufferString([message]);
    return sum + estimateTokensFromText(text);
  }, 0);
}

function splitMessagesByTokenShare(messages: BaseMessage[], parts: number): BaseMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const normalizedParts = Math.min(
    Math.max(1, normalizePositiveInt(parts, DEFAULT_SUMMARIZATION_PARTS)),
    messages.length,
  );
  if (normalizedParts <= 1) {
    return [messages];
  }

  const weighted = messages.map((message) => ({
    message,
    tokens: estimateTokensFromText(getBufferString([message])),
  }));
  const totalTokens = weighted.reduce((sum, item) => sum + item.tokens, 0);
  const targetTokens = Math.max(1, totalTokens / normalizedParts);
  const chunks: BaseMessage[][] = [];
  let currentChunk: BaseMessage[] = [];
  let currentTokens = 0;

  for (const item of weighted) {
    if (
      chunks.length < normalizedParts - 1 &&
      currentChunk.length > 0 &&
      currentTokens + item.tokens > targetTokens
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
    currentChunk.push(item.message);
    currentTokens += item.tokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildMergeSummariesPrompt(partialSummaries: string[], customPrompt?: string): string {
  const additionalFocus =
    customPrompt && customPrompt.trim().length > 0
      ? `\n\nAdditional focus:\n${customPrompt.trim()}`
      : '';
  const partials = partialSummaries
    .map((summary, index) => `Partial ${index + 1}:\n${summary}`)
    .join('\n\n');
  return `${MERGE_SUMMARIES_PROMPT}${additionalFocus}\n\n${partials}`;
}

function normalizePromptOverride(prompt?: string): string | undefined {
  if (typeof prompt !== 'string') {
    return undefined;
  }
  const normalized = prompt.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function createSummarizeFn({
  resolveConfig,
  getProviderOptions,
  onUsage,
}: {
  resolveConfig: (agentId: string) => ResolvedSummarizationConfig;
  getProviderOptions: GetProviderOptionsFn;
  onUsage?: (usage: SummarizationUsage) => void | Promise<void>;
}): SummarizeFn {
  const modelCache = new Map<string, Runnable>();

  return async ({ agentId, messagesToRefine }) => {
    const resolved = resolveConfig(agentId);
    if (!resolved.enabled) {
      throw new Error('Summarization is disabled for this agent');
    }
    if (!resolved.provider || !resolved.model) {
      throw new Error('Summarization provider/model must be configured');
    }
    if (!resolved.prompt || !resolved.prompt.trim()) {
      throw new Error('Summarization prompt must be configured');
    }
    const promptOverride = normalizePromptOverride(resolved.prompt);
    const summarizePrompt = buildSummarizationPrompt(messagesToRefine, promptOverride);

    const { provider, clientOptions, model } = await getProviderOptions(resolved);
    const cacheKey = `${agentId}|${provider}|${model}`;

    let chatModel = modelCache.get(cacheKey);
    if (!chatModel) {
      const ChatModelClass = getChatModelClass(provider);
      chatModel = new ChatModelClass({
        ...clientOptions,
        streaming: false,
      }) as Runnable;
      modelCache.set(cacheKey, chatModel);
    }

    const invokeSummary = async ({
      currentPrompt,
      phase,
    }: {
      currentPrompt: string;
      phase: SummarizationUsage['phase'];
    }) => {
      const response = await chatModel.invoke(currentPrompt);
      const text = extractTextContent(response.content).trim();
      const usageMeta = response.usage_metadata as
        | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
        | undefined;

      await onUsage?.({
        type: 'summarization',
        phase,
        provider: provider as string,
        model,
        input_tokens: usageMeta?.input_tokens,
        output_tokens: usageMeta?.output_tokens,
        total_tokens: usageMeta?.total_tokens,
      });

      return {
        text,
        tokenCount: usageMeta?.output_tokens ?? estimateTokensFromText(text),
      };
    };

    const summarizeInStages = async () => {
      const parts = normalizePositiveInt(resolved.parameters?.parts, DEFAULT_SUMMARIZATION_PARTS);
      const chunks = splitMessagesByTokenShare(messagesToRefine, parts).filter(
        (chunk) => chunk.length > 0,
      );
      if (chunks.length <= 1) {
        return invokeSummary({ currentPrompt: summarizePrompt, phase: 'single' });
      }

      const partials: string[] = [];
      let latestTokenCount = 0;
      for (const chunk of chunks) {
        const chunkPrompt = buildSummarizationPrompt(chunk, promptOverride);
        const chunkResult = await invokeSummary({
          currentPrompt: chunkPrompt,
          phase: 'chunk',
        });
        latestTokenCount = chunkResult.tokenCount;
        if (chunkResult.text.length > 0) {
          partials.push(chunkResult.text);
        }
      }

      if (partials.length === 0) {
        throw new Error('Summarization returned empty partial summaries');
      }

      if (partials.length === 1) {
        return {
          text: partials[0],
          tokenCount: latestTokenCount || estimateTokensFromText(partials[0]),
        };
      }

      const mergePrompt = buildMergeSummariesPrompt(partials, promptOverride);
      return invokeSummary({ currentPrompt: mergePrompt, phase: 'merge' });
    };

    const parts = normalizePositiveInt(resolved.parameters?.parts, DEFAULT_SUMMARIZATION_PARTS);
    const minMessagesForSplit = normalizePositiveInt(
      resolved.parameters?.minMessagesForSplit,
      DEFAULT_MIN_MESSAGES_FOR_SPLIT,
    );
    const maxInputTokensForSinglePass = normalizePositiveInt(
      resolved.parameters?.maxInputTokensForSinglePass,
      DEFAULT_MAX_INPUT_TOKENS_FOR_SINGLE_PASS,
    );

    const estimatedInputTokens =
      messagesToRefine.length > 0
        ? estimateMessagesTokens(messagesToRefine)
        : estimateTokensFromText(summarizePrompt);
    const canStageSummarization = parts > 1 && messagesToRefine.length >= minMessagesForSplit;
    const shouldStageSummarization =
      canStageSummarization && estimatedInputTokens > maxInputTokensForSinglePass;

    let summaryResult: { text: string; tokenCount: number };
    if (shouldStageSummarization) {
      summaryResult = await summarizeInStages();
    } else {
      try {
        summaryResult = await invokeSummary({ currentPrompt: summarizePrompt, phase: 'single' });
      } catch (error) {
        if (!canStageSummarization) {
          throw error;
        }
        summaryResult = await summarizeInStages();
      }
    }

    return {
      text: summaryResult.text,
      tokenCount: summaryResult.tokenCount,
      model,
      provider: provider as string,
    };
  };
}

export function buildSummarizationPrompt(
  messagesToRefine: BaseMessage[],
  customPrompt?: string,
): string {
  const prompt = customPrompt?.trim().length ? customPrompt.trim() : '';
  if (!prompt) {
    throw new Error('Summarization prompt must be configured');
  }
  const transcript = getBufferString(messagesToRefine);
  return `${prompt}\n\nConversation:\n${transcript}`;
}

export function createSummarizeHandler(options: SummarizeOptions): EventHandler {
  const { summarize, persistSummary, onStatusChange } = options;

  return {
    handle: async (_event: string, data: SummarizeRequest) => {
      const { resolve, reject } = data;
      const fail = (error: unknown): Error =>
        error instanceof Error ? error : new Error(String(error));

      try {
        await onStatusChange?.({
          status: 'started',
          agentId: data.agentId,
        });

        const summary = await summarize({
          agentId: data.agentId,
          context: data.context,
          messagesToRefine: data.messagesToRefine,
          remainingContextTokens: data.remainingContextTokens,
          configurable: data.configurable,
          metadata: data.metadata,
        });

        const normalizedSummary: SummarizationResponse = {
          ...summary,
          text: summary.text.trim(),
          tokenCount: summary.tokenCount,
        };

        if (!normalizedSummary.text) {
          throw new Error('Summarization response text is empty');
        }

        const persistResult = persistSummary
          ? await persistSummary({
              summary: normalizedSummary,
              agentId: data.agentId,
              context: data.context,
              messagesToRefine: data.messagesToRefine,
              configurable: data.configurable,
              metadata: data.metadata,
            })
          : undefined;

        await onStatusChange?.({
          status: 'completed',
          agentId: data.agentId,
          persistence: persistResult?.status ?? 'skipped',
        });

        const result: SummarizeResult = {
          text: normalizedSummary.text,
          tokenCount: normalizedSummary.tokenCount,
          model: normalizedSummary.model,
          provider: normalizedSummary.provider,
          targetMessageId: persistResult?.targetMessageId,
          targetContentIndex: persistResult?.targetContentIndex,
        };

        resolve(result);
      } catch (error) {
        logger.error('Error during summarization', error);
        const normalizedError = fail(error);
        await onStatusChange?.({
          status: 'failed',
          agentId: data.agentId,
          error: normalizedError.message,
        });
        reject(normalizedError);
      }
    },
  };
}
