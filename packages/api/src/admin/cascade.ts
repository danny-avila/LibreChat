import { logger } from '@librechat/data-schemas';
import { getSafeErrorMetadata } from '~/utils/errors';

/** One removal in a delete cascade, with the way to put back what it removed. */
export interface CascadeStep {
  name: string;
  /** Removes the dependents and returns whatever is needed to restore them. */
  remove: () => Promise<unknown>;
  /** Re-creates the removed dependents; omitted when the step cannot be undone. */
  restore?: (removed: unknown) => Promise<void>;
}

export interface CascadeOutcome {
  /** Names of the steps whose removal threw. */
  failed: string[];
  /** Each fulfilled step's `remove` result, by step name. */
  removed: Record<string, unknown>;
  /** Best-effort restore of every fulfilled step; failures are logged, never thrown. */
  compensate: () => Promise<void>;
}

/** Builds a typed step; the restore callback receives exactly what `remove` returned. */
export function cascadeStep<T>(
  name: string,
  remove: () => Promise<T>,
  restore?: (removed: T) => Promise<void>,
): CascadeStep {
  return {
    name,
    remove,
    restore: restore ? (removed) => restore(removed as T) : undefined,
  };
}

/**
 * Runs the removals concurrently and reports which failed. When the caller cannot
 * finish the delete (a step failed, or the parent record could not be deleted), it
 * calls `compensate` so the dependents are put back instead of orphaning a parent
 * that still exists.
 */
export async function runCascade(steps: CascadeStep[], logPrefix: string): Promise<CascadeOutcome> {
  const settled = await Promise.allSettled(steps.map((step) => step.remove()));
  const failed: string[] = [];
  const removed: Record<string, unknown> = {};
  settled.forEach((result, index) => {
    const { name } = steps[index];
    if (result.status === 'rejected') {
      failed.push(name);
      logger.error(
        `${logPrefix} cascade step failed: ${name}`,
        getSafeErrorMetadata(result.reason),
      );
      return;
    }
    removed[name] = result.value;
  });

  async function compensate(): Promise<void> {
    for (const step of steps) {
      if (!(step.name in removed) || !step.restore) {
        continue;
      }
      try {
        await step.restore(removed[step.name]);
      } catch (error) {
        logger.error(
          `${logPrefix} cascade restore failed: ${step.name}`,
          getSafeErrorMetadata(error),
        );
      }
    }
  }

  return { failed, removed, compensate };
}
