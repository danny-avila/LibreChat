import { randomUUID } from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import {
  createLangfuseHandler,
  disposeLangfuseHandler,
  withLangfuseAttributes,
  initializeLangfuseTracing,
} from '@librechat/agents';
import type { ChatGeneration } from '@langchain/core/outputs';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { MediaContext } from './context';
import { buildLangfuseConfig } from '~/langfuse/config';

export type MediaModelTraceInput = {
  context: MediaContext;
  jobId: string;
  threadId: string;
  kind: 'title' | 'submission';
  model: string;
  provider: string;
};
export interface MediaModelTracer {
  run<T>(
    input: MediaModelTraceInput,
    work: () => Promise<T>,
    usage: (result: T) => UsageMetadata | undefined,
  ): Promise<T>;
}
type MediaTraceHandler = Pick<
  NonNullable<ReturnType<typeof createLangfuseHandler>>,
  'handleLLMStart' | 'handleLLMEnd' | 'handleLLMError'
>;

/** Reuses the SDK's destination isolation and sampling; media bytes and prompts never enter callbacks. */
export function createMediaModelTracer(
  deps: {
    handler?: (input: Parameters<typeof createLangfuseHandler>[0]) => MediaTraceHandler | undefined;
    config?: typeof buildLangfuseConfig;
    dispose?: typeof disposeLangfuseHandler;
    attributes?: typeof withLangfuseAttributes;
    initialize?: typeof initializeLangfuseTracing;
  } = {},
): MediaModelTracer {
  return {
    async run(input, work, usage) {
      const runId = randomUUID();
      const traceIdSeed = JSON.stringify([
        'media',
        input.context.scope.tenantId,
        input.context.scope.ownerId,
        input.jobId,
        input.kind,
      ]);
      let params: Parameters<typeof createLangfuseHandler>[0];
      let handler: MediaTraceHandler | undefined;
      try {
        const langfuse = (deps.config ?? buildLangfuseConfig)({
          appConfig: input.context.appConfig,
          user: input.context.user,
          tenantId: input.context.scope.tenantId ?? undefined,
          runId: traceIdSeed,
        });
        (deps.initialize ?? initializeLangfuseTracing)(langfuse);
        params = {
          langfuse,
          runId,
          traceIdSeed,
          sessionId: input.threadId,
          traceName: `media.${input.kind}`,
          traceMetadata: { 'librechat.media.job.id': input.jobId },
        };
        handler = (deps.handler ?? createLangfuseHandler)(params);
      } catch {
        return work();
      }
      const trace = handler;
      if (!trace) return work();
      const safely = async (action: () => void | Promise<void>) => {
        try {
          await action();
        } catch {
          /* Never expose provider errors or fail inference. */
        }
      };
      await safely(() =>
        (deps.attributes ?? withLangfuseAttributes)(params, () =>
          trace.handleLLMStart(
            { lc: 1, type: 'constructor', id: ['media', input.provider], kwargs: {} },
            ['[Media request content omitted]'],
            runId,
            undefined,
            { invocation_params: { model_name: input.model } },
            [],
            { model: input.model },
          ),
        ),
      );
      try {
        const result = await work();
        await safely(() => {
          const measured = usage(result);
          const inputTokens = measured?.input_tokens ?? 0;
          const outputTokens = measured?.output_tokens ?? 0;
          const generation: ChatGeneration = {
            text: '[Media output content omitted]',
            message: new AIMessage({
              content: '[Media output content omitted]',
              ...(measured
                ? {
                    usage_metadata: {
                      ...measured,
                      input_tokens: inputTokens,
                      output_tokens: outputTokens,
                      total_tokens: measured.total_tokens ?? inputTokens + outputTokens,
                    },
                  }
                : {}),
            }),
          };
          return trace.handleLLMEnd({ generations: [[generation]] }, runId);
        });
        return result;
      } catch (error) {
        await safely(() => trace.handleLLMError(new Error('Media model call failed.'), runId));
        throw error;
      } finally {
        void safely(() => (deps.dispose ?? disposeLangfuseHandler)(trace));
      }
    },
  };
}
