import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import type { TToolReviewerConfig } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import type { HookCallback } from '@librechat/agents';
import { buildReviewerTranscript } from './reviewerEvidence';
import { REVIEWER_POLICY } from './reviewerPolicy';

const assessmentSchema = z
  .object({
    outcome: z.enum(['allow', 'deny', 'ask']),
    risk_level: z.enum(['low', 'medium', 'high', 'critical']),
    user_authorization: z.enum(['unknown', 'low', 'medium', 'high']),
    rationale: z.string().trim().min(1).max(1000),
  })
  .strict();

export interface ReviewerModel {
  invoke: (prompt: string, signal: AbortSignal) => Promise<string>;
}

export interface AutoReviewer {
  review: HookCallback<'PreToolUse'>;
  /** New steering invalidates the captured authorization until the next run. */
  invalidate: () => void;
}

/** Reviews one exact action; no decision is cached or reused for another tool call. */
export function createAutoReviewer({
  config,
  messages,
  getModel,
}: {
  config: TToolReviewerConfig;
  messages: readonly BaseMessage[] | (() => readonly BaseMessage[]);
  getModel: () => Promise<ReviewerModel>;
}): AutoReviewer {
  let valid = true;
  return {
    invalidate: () => {
      valid = false;
    },
    review: async (input, parentSignal) => {
      const fallback = {
        decision: 'ask' as const,
        reason: 'Auto review could not approve this action. Please review it.',
      };
      if (!valid || parentSignal?.aborted) return fallback;
      const controller = new AbortController();
      const abort = () => controller.abort();
      parentSignal?.addEventListener('abort', abort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const transcript = buildReviewerTranscript(
          typeof messages === 'function' ? messages() : messages,
        );
        if (!transcript.some((message) => message.role === 'human'))
          return {
            ...fallback,
            reason: 'Auto review has no user authorization context. Please review this action.',
          };
        const evidence = JSON.stringify({
          transcript,
          action: {
            tool: input.toolName,
            arguments: input.toolInput,
            agentId: input.executingAgentId,
          },
        });
        /** Never silently remove an authorization constraint or part of the proposed action. */
        if (evidence.length > config.maxInputChars)
          return {
            ...fallback,
            reason:
              'The conversation exceeds the auto review context limit. Please review this action.',
          };
        const cancelled = new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Review cancelled')), {
            once: true,
          });
          timer = setTimeout(abort, config.timeoutMs);
        });
        const response = await Promise.race([
          (async () => {
            const model = await getModel();
            controller.signal.throwIfAborted();
            return model.invoke(
              `${REVIEWER_POLICY}\n\nEvidence (JSON):\n${evidence}`,
              controller.signal,
            );
          })(),
          cancelled,
        ]);
        if (!valid || controller.signal.aborted) return fallback;
        const assessment = assessmentSchema.parse(JSON.parse(response));
        let decision = assessment.outcome;
        if (assessment.risk_level === 'critical') decision = 'deny';
        else if (
          decision === 'allow' &&
          assessment.risk_level === 'high' &&
          !['medium', 'high'].includes(assessment.user_authorization)
        )
          decision = 'ask';
        logger.info('[auto-review] Decision', {
          toolUseId: input.toolUseId,
          tool: input.toolName,
          agentId: input.executingAgentId,
          model: config.model,
          endpoint: config.endpoint,
          decision,
          risk: assessment.risk_level,
          authorization: assessment.user_authorization,
        });
        return { decision, reason: assessment.rationale };
      } catch {
        logger.warn('[auto-review] Review unavailable', {
          toolUseId: input.toolUseId,
          model: config.model,
        });
        return fallback;
      } finally {
        clearTimeout(timer);
        parentSignal?.removeEventListener('abort', abort);
      }
    },
  };
}
