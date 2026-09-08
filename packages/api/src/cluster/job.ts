import crypto from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { Collection, Document, WithId } from 'mongodb';

type JobStatus = 'running' | 'completed' | 'failed';

interface JobState extends Document {
  _id: string;
  status: JobStatus;
  owner?: string;
  expiresAt: Date;
  updatedAt: Date;
}

interface DistributedJobOptions {
  leaseMs?: number;
  refreshMs?: number;
  completionTtlMs?: number;
  failureTtlMs?: number;
  pollMs?: number;
  onLeaseLost?: () => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_REFRESH_MS = 60 * 1000;
const DEFAULT_COMPLETION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 30 * 1000;
const DEFAULT_POLL_MS = 2000;
const LEASE_SAFETY_MS = 5000;

const getAbortError = (jobId: string, signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error(`Distributed job ${jobId} was cancelled`);

const sleep = (duration: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(getAbortError('acquisition', signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, duration);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });

async function tryAcquire(
  collection: Collection<JobState>,
  jobId: string,
  owner: string,
  leaseMs: number,
): Promise<Date | undefined> {
  const now = new Date();

  try {
    const state = await collection.findOneAndUpdate(
      {
        _id: jobId,
        $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
      },
      {
        $set: {
          status: 'running',
          owner,
          expiresAt: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    return state?.owner === owner ? state.expiresAt : undefined;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return;
    }
    throw error;
  }
}

/**
 * Runs one logical job across replicas under a renewable MongoDB lease.
 *
 * The lease owner alone executes `handler`; followers poll until they can take
 * over or observe a still-valid completion marker. A follower returns
 * `undefined` when another replica already completed the job, while the owner
 * returns the handler result. Completion and failure transitions are fenced by
 * owner and unexpired lease. By default, losing the lease terminates the
 * process so stale work cannot continue; callers may override `onLeaseLost`
 * only when they can provide an equally safe fail-stop action.
 */
export async function runDistributedJob<T>(
  collection: Collection<JobState>,
  jobId: string,
  handler: (signal: AbortSignal) => Promise<T>,
  options: DistributedJobOptions = {},
): Promise<T | undefined> {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const completionTtlMs = options.completionTtlMs ?? DEFAULT_COMPLETION_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs;
  if (
    !Number.isFinite(leaseMs) ||
    !Number.isFinite(refreshMs) ||
    leaseMs <= LEASE_SAFETY_MS ||
    refreshMs <= 0 ||
    refreshMs >= leaseMs - LEASE_SAFETY_MS
  ) {
    throw new RangeError(
      `Invalid distributed job timing: leaseMs must exceed ${LEASE_SAFETY_MS}ms and refreshMs must be positive with at least ${LEASE_SAFETY_MS}ms safety margin`,
    );
  }
  if (timeoutMs != null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new RangeError('Distributed job timeout must be a positive finite number');
  }
  const onLeaseLost =
    options.onLeaseLost ??
    (() => {
      process.exit(1);
    });
  const owner = crypto.randomUUID();
  const controller = new AbortController();
  const abortFromCaller = () =>
    controller.abort(
      options.signal?.reason instanceof Error
        ? options.signal.reason
        : new Error(`Distributed job ${jobId} was cancelled`),
    );
  let deadlineTimer: NodeJS.Timeout | undefined;
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  if (timeoutMs != null) {
    deadlineTimer = setTimeout(() => {
      controller.abort(
        new Error(`Distributed job ${jobId} did not complete within ${timeoutMs}ms`),
      );
    }, timeoutMs);
  }

  let acquiredExpiry: Date | undefined;
  try {
    if (controller.signal.aborted) {
      throw getAbortError(jobId, controller.signal);
    }
    while ((acquiredExpiry = await tryAcquire(collection, jobId, owner, leaseMs)) == null) {
      if (controller.signal.aborted) {
        throw getAbortError(jobId, controller.signal);
      }
      const state = (await collection.findOne({ _id: jobId })) as WithId<JobState> | null;
      if (state?.status === 'completed' && state.expiresAt > new Date()) {
        return;
      }
      await sleep(pollMs, controller.signal);
    }

    let leaseExpiresAt = acquiredExpiry.getTime();
    let leaseLost = false;
    let finalizing = false;
    let refreshing = false;
    let watchdogTimer: NodeJS.Timeout | undefined;
    let refreshInFlight: Promise<void> = Promise.resolve();

    const loseLease = (message: string, error?: unknown) => {
      if (leaseLost) {
        return;
      }
      leaseLost = true;
      clearInterval(refreshTimer);
      clearTimeout(watchdogTimer);
      logger.error(message, error);
      onLeaseLost();
    };

    const scheduleWatchdog = () => {
      clearTimeout(watchdogTimer);
      const delay = Math.max(0, leaseExpiresAt - Date.now() - LEASE_SAFETY_MS);
      watchdogTimer = setTimeout(() => {
        loseLease(`[DistributedJob] Lease renewal deadline reached for ${jobId}`);
      }, delay);
      watchdogTimer.unref();
    };

    const refreshLease = async () => {
      try {
        const now = new Date();
        const result = await collection.updateOne(
          { _id: jobId, status: 'running', owner, expiresAt: { $gt: now } },
          {
            $set: {
              expiresAt: new Date(now.getTime() + leaseMs),
              updatedAt: now,
            },
          },
        );
        if (result.matchedCount !== 1) {
          if (!finalizing) {
            loseLease(`[DistributedJob] Lost lease for ${jobId}`);
          }
          return;
        }
        leaseExpiresAt = now.getTime() + leaseMs;
        scheduleWatchdog();
      } catch (error) {
        logger.error(`[DistributedJob] Failed to refresh lease for ${jobId}`, error);
      }
    };

    const refreshTimer = setInterval(() => {
      if (finalizing || refreshing) {
        return;
      }
      refreshing = true;
      refreshInFlight = refreshLease().finally(() => {
        refreshing = false;
      });
    }, refreshMs);
    refreshTimer.unref();
    scheduleWatchdog();

    const stopRenewal = async () => {
      finalizing = true;
      clearInterval(refreshTimer);
      await refreshInFlight;
      if (leaseLost) {
        throw new Error(`Lost distributed job lease for ${jobId}`);
      }
    };

    const rejectCancellation = (reject: (reason?: unknown) => void) =>
      reject(getAbortError(jobId, controller.signal));
    let onCancelled: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      if (controller.signal.aborted) {
        rejectCancellation(reject);
        return;
      }
      onCancelled = () => rejectCancellation(reject);
      controller.signal.addEventListener('abort', onCancelled, { once: true });
    });

    const failJob = async (error: unknown, renewalStopped = false): Promise<never> => {
      if (!renewalStopped) {
        await stopRenewal();
      }
      const now = new Date();
      const cancelledOrTimedOut = controller.signal.aborted;
      const failure = await collection.updateOne(
        { _id: jobId, status: 'running', owner, expiresAt: { $gt: now } },
        {
          $set: {
            status: 'failed',
            expiresAt: cancelledOrTimedOut ? now : new Date(now.getTime() + failureTtlMs),
            updatedAt: now,
          },
          $unset: { owner: '' },
        },
      );
      if (failure.matchedCount !== 1) {
        loseLease(`[DistributedJob] Lost lease while failing ${jobId}`);
      }
      throw error;
    };

    try {
      let result: T;
      try {
        result = await Promise.race([handler(controller.signal), cancelled]);
        if (controller.signal.aborted) {
          throw getAbortError(jobId, controller.signal);
        }
      } catch (error) {
        return await failJob(error);
      }

      await stopRenewal();
      if (controller.signal.aborted) {
        return await failJob(getAbortError(jobId, controller.signal), true);
      }
      const now = new Date();
      const completion = await collection.updateOne(
        { _id: jobId, status: 'running', owner, expiresAt: { $gt: now } },
        {
          $set: {
            status: 'completed',
            expiresAt: new Date(now.getTime() + completionTtlMs),
            updatedAt: now,
          },
          $unset: { owner: '' },
        },
      );
      if (completion.matchedCount !== 1) {
        loseLease(`[DistributedJob] Lost lease while completing ${jobId}`);
        throw new Error(`Lost distributed job lease for ${jobId}`);
      }
      return result;
    } finally {
      if (onCancelled) {
        controller.signal.removeEventListener('abort', onCancelled);
      }
      clearInterval(refreshTimer);
      clearTimeout(watchdogTimer);
    }
  } finally {
    clearTimeout(deadlineTimer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
