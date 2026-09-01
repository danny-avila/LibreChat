import crypto from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { Collection, Document, WithId } from 'mongodb';

type JobStatus = 'running' | 'completed' | 'failed';

interface DistributedJobState extends Document {
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
}

const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_REFRESH_MS = 60 * 1000;
const DEFAULT_COMPLETION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 30 * 1000;
const DEFAULT_POLL_MS = 2000;
const LEASE_SAFETY_MS = 5000;

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

async function tryAcquire(
  collection: Collection<DistributedJobState>,
  jobId: string,
  owner: string,
  leaseMs: number,
): Promise<boolean> {
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
    return state?.owner === owner;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return false;
    }
    throw error;
  }
}

export async function runDistributedJob<T>(
  collection: Collection<DistributedJobState>,
  jobId: string,
  handler: () => Promise<T>,
  options: DistributedJobOptions = {},
): Promise<T | undefined> {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const completionTtlMs = options.completionTtlMs ?? DEFAULT_COMPLETION_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const onLeaseLost =
    options.onLeaseLost ??
    (() => {
      process.exit(1);
    });
  const owner = crypto.randomUUID();

  while (!(await tryAcquire(collection, jobId, owner, leaseMs))) {
    const state = (await collection.findOne({ _id: jobId })) as WithId<DistributedJobState> | null;
    if (state?.status === 'completed' && state.expiresAt > new Date()) {
      return;
    }
    await sleep(pollMs);
  }

  let leaseExpiresAt = Date.now() + leaseMs;
  let leaseLost = false;
  let watchdogTimer: NodeJS.Timeout | undefined;

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

  const refreshTimer = setInterval(async () => {
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
        loseLease(`[DistributedJob] Lost lease for ${jobId}`);
        return;
      }
      leaseExpiresAt = now.getTime() + leaseMs;
      scheduleWatchdog();
    } catch (error) {
      logger.error(`[DistributedJob] Failed to refresh lease for ${jobId}`, error);
    }
  }, refreshMs);
  refreshTimer.unref();
  scheduleWatchdog();

  try {
    let result: T;
    try {
      result = await handler();
    } catch (error) {
      const now = new Date();
      const failure = await collection.updateOne(
        { _id: jobId, status: 'running', owner },
        {
          $set: {
            status: 'failed',
            expiresAt: new Date(now.getTime() + failureTtlMs),
            updatedAt: now,
          },
          $unset: { owner: '' },
        },
      );
      if (failure.matchedCount !== 1) {
        loseLease(`[DistributedJob] Lost lease while failing ${jobId}`);
      }
      throw error;
    }

    const now = new Date();
    const completion = await collection.updateOne(
      { _id: jobId, status: 'running', owner },
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
    clearInterval(refreshTimer);
    clearTimeout(watchdogTimer);
  }
}
