import { getBufferString } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { EventHandler, SummarizeRequest, SummarizeResult } from '@librechat/agents';

export type SummarizationStatus = {
  status: 'started' | 'completed' | 'failed';
  agentId: string;
  error?: string;
  persistence?: 'persisted' | 'deferred' | 'skipped';
};

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

const DEFAULT_SUMMARIZE_PROMPT = `Summarize the following conversation for context continuity.
Preserve the user's goal, key decisions, important file paths, current progress, next steps, and relevant errors.
Be concise and practical.`;

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
