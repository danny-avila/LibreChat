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
  prompt: string;
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
  customPrompt?: string;
  persistSummary?: PersistSummaryFn;
  onStatusChange?: (event: SummarizationStatus) => void | Promise<void>;
}

export type SummarizationUsage = {
  type: 'summarization';
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export type ResolvedSummarizationConfig = {
  enabled: boolean;
  provider: string;
  model: string;
  parameters: Record<string, unknown>;
  prompt?: string;
};

export type GetProviderOptionsFn = (resolved: ResolvedSummarizationConfig) => Promise<{
  provider: Providers;
  clientOptions: ClientOptions;
  model: string;
}>;

const SUMMARIZATION_DEFAULTS = {
  provider: 'openAI',
  model: 'gpt-4.1-mini',
  temperature: 0.3,
};

const DEFAULT_SUMMARIZE_PROMPT = `Summarize the following conversation for context continuity. The AI assistant will use this summary to continue the user's task when the original conversation is no longer accessible due to context window constraints.

Preserve: the user's objective, key decisions, important code/file paths, current progress state, next steps, relevant errors and resolutions, and critical tool results.

Be concise but thorough. Focus on what is needed to continue the task effectively.`;

export function resolveSummarizationLLMConfig({
  agentId,
  globalConfig,
  agentRuntimeConfig,
}: {
  agentId: string;
  globalConfig?: SummarizationConfig;
  agentRuntimeConfig?: { provider?: string; model?: string };
}): ResolvedSummarizationConfig {
  const agentOverride = globalConfig?.agents?.[agentId];

  if (agentOverride?.enabled === false) {
    return {
      enabled: false,
      provider: SUMMARIZATION_DEFAULTS.provider,
      model: SUMMARIZATION_DEFAULTS.model,
      parameters: { temperature: SUMMARIZATION_DEFAULTS.temperature },
    };
  }

  const provider =
    agentOverride?.provider ??
    globalConfig?.provider ??
    agentRuntimeConfig?.provider ??
    SUMMARIZATION_DEFAULTS.provider;

  const model =
    agentOverride?.model ??
    globalConfig?.model ??
    agentRuntimeConfig?.model ??
    SUMMARIZATION_DEFAULTS.model;

  const parameters = {
    temperature: SUMMARIZATION_DEFAULTS.temperature,
    ...globalConfig?.parameters,
    ...agentOverride?.parameters,
  };

  const prompt = agentOverride?.prompt ?? globalConfig?.prompt;

  return {
    enabled: globalConfig?.enabled !== false,
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

  return async ({ prompt, agentId }) => {
    const resolved = resolveConfig(agentId);
    if (!resolved.enabled) {
      throw new Error('Summarization is disabled for this agent');
    }

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

    const response = await chatModel.invoke(prompt);
    const text = extractTextContent(response.content);
    const usageMeta = response.usage_metadata as
      | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      | undefined;

    const tokenCount = usageMeta?.output_tokens ?? Math.ceil(text.length / 3.5);

    await onUsage?.({
      type: 'summarization',
      provider: provider as string,
      model,
      input_tokens: usageMeta?.input_tokens,
      output_tokens: usageMeta?.output_tokens,
      total_tokens: usageMeta?.total_tokens,
    });

    return {
      text,
      tokenCount,
      model,
      provider: provider as string,
    };
  };
}

export function buildSummarizationPrompt(
  messagesToRefine: BaseMessage[],
  customPrompt?: string,
): string {
  const prompt = customPrompt?.trim().length ? customPrompt.trim() : DEFAULT_SUMMARIZE_PROMPT;
  const transcript = getBufferString(messagesToRefine);
  return `${prompt}\n\nConversation:\n${transcript}`;
}

export function createDeferredPersistSummary(): PersistSummaryFn {
  return async () => ({
    status: 'deferred',
  });
}

export function createSummarizeHandler(options: SummarizeOptions): EventHandler {
  const { summarize, persistSummary, customPrompt, onStatusChange } = options;

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

        const prompt = buildSummarizationPrompt(data.messagesToRefine, customPrompt);
        const summary = await summarize({
          prompt,
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
