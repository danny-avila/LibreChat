import { logger } from '@librechat/data-schemas';
import type { GenerationSettledListener } from './GenerationJobManager';
import type { GenerationJobStatus } from '../types/stream';

const ACTIVE_STATUSES: ReadonlySet<GenerationJobStatus> = new Set(['running', 'requires_action']);
const DEFAULT_RECHECK_MS = 60_000;
const DEFAULT_MAX_WAIT_MS = 24 * 60 * 60 * 1_000;

export interface GenerationSettledSource {
  getJobStatus: (streamId: string) => Promise<GenerationJobStatus | undefined>;
  onGenerationSettled: (listener: GenerationSettledListener) => () => void;
}

export interface GenerationSettledWaitOptions {
  recheckMs?: number;
  maxWaitMs?: number;
}

/**
 * Resolves once the conversation's running or paused generation settles: `true`
 * when it settled, `false` when none was running or it outlived `maxWaitMs`.
 * Settlement is signalled in-process; a periodic status read covers a
 * generation that resumes and settles on another replica.
 */
export function waitForGenerationSettled(
  source: GenerationSettledSource,
  conversationId: string,
  {
    recheckMs = DEFAULT_RECHECK_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
  }: GenerationSettledWaitOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (settled: boolean): void => {
      if (done) {
        return;
      }
      done = true;
      unsubscribe();
      clearInterval(recheck);
      clearTimeout(deadline);
      resolve(settled);
    };
    const unsubscribe = source.onGenerationSettled((event) => {
      if (event.conversationId === conversationId) {
        finish(true);
      }
    });
    const readStatus = async (initial: boolean): Promise<void> => {
      try {
        const status = await source.getJobStatus(conversationId);
        if (status == null || !ACTIVE_STATUSES.has(status)) {
          finish(!initial);
        }
      } catch (error) {
        logger.warn(
          `[GenerationSettled] Failed to read generation status for ${conversationId}:`,
          error,
        );
        if (initial) {
          finish(false);
        }
      }
    };
    const recheck = setInterval(() => void readStatus(false), recheckMs);
    const deadline = setTimeout(() => finish(false), maxWaitMs);
    recheck.unref?.();
    deadline.unref?.();
    void readStatus(true);
  });
}
