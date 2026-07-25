import Keyv from 'keyv';
import { v4 as uuidv4 } from 'uuid';

import type { ImportJob } from './types';

const DEFAULT_TTL = 24 * 60 * 60 * 1000;

function emptyProgress(): ImportJob['progress'] {
  return {
    conversations: { done: 0, total: 0 },
    messages: { done: 0, total: 0 },
    assets: { done: 0, total: 0 },
  };
}

export type StartTransitionResult =
  | { status: 'started'; job: ImportJob }
  | { status: 'not_found' }
  | { status: 'conflict'; job: ImportJob };

export class ImportJobStore {
  private readonly store: Keyv;
  private readonly ttl: number;
  /** Serializes `confirmStart` calls sharing the same job key. `Keyv`'s
   * `get`/`set` pair is not itself atomic — without this, two racing
   * `/start` requests can both read `awaiting_confirmation` before either
   * write lands, launching the background run twice over the same
   * archive. Scoped to this process; see `confirmStart`. */
  private readonly transitionLocks = new Map<string, Promise<void>>();

  constructor(store: Keyv, ttl: number = DEFAULT_TTL) {
    this.store = store;
    this.ttl = ttl;
  }

  private key(userId: string, jobId: string): string {
    return `${userId}:${jobId}`;
  }

  async create(input: { userId: string; filepath: string; filename: string }): Promise<ImportJob> {
    const now = Date.now();
    const job: ImportJob = {
      jobId: uuidv4(),
      userId: input.userId,
      filepath: input.filepath,
      filename: input.filename,
      phase: 'queued',
      status: 'active',
      summary: null,
      progress: emptyProgress(),
      report: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.set(this.key(input.userId, job.jobId), job, this.ttl);
    return job;
  }

  async get(userId: string, jobId: string): Promise<ImportJob | null> {
    const job = await this.store.get<ImportJob>(this.key(userId, jobId));
    return job ?? null;
  }

  async patch(
    userId: string,
    jobId: string,
    patch: Omit<Partial<ImportJob>, 'userId' | 'jobId'>,
  ): Promise<ImportJob | null> {
    const existing = await this.get(userId, jobId);
    if (!existing) {
      return null;
    }

    const updated: ImportJob = { ...existing, ...patch, updatedAt: Date.now() };
    await this.store.set(this.key(userId, jobId), updated, this.ttl);
    return updated;
  }

  async cancel(userId: string, jobId: string): Promise<boolean> {
    const updated = await this.patch(userId, jobId, {
      status: 'cancelled',
      phase: 'cancelled',
    });
    return updated !== null;
  }

  async isCancelled(userId: string, jobId: string): Promise<boolean> {
    const job = await this.get(userId, jobId);
    return job?.status === 'cancelled';
  }

  private async withTransitionLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.transitionLocks.get(lockKey) ?? Promise.resolve();
    const settled = previous.then(fn);
    const tracked: Promise<void> = settled.then(
      () => undefined,
      () => undefined,
    );
    this.transitionLocks.set(lockKey, tracked);
    try {
      return await settled;
    } finally {
      if (this.transitionLocks.get(lockKey) === tracked) {
        this.transitionLocks.delete(lockKey);
      }
    }
  }

  /**
   * Atomically moves a job out of `awaiting_confirmation` so at most one
   * caller ever launches the background run for it. A second, racing call
   * for the same job — a double-click, a client retry, or a replay —
   * observes the job already out of that phase and gets `status:
   * 'conflict'` instead of silently re-running the import over the same
   * archive.
   *
   * The job lands in `queued`, not in a working phase: the background run
   * announces `assets` and then `conversations` itself, so the phase the
   * client polls always reflects what the run is actually doing.
   */
  async confirmStart(userId: string, jobId: string): Promise<StartTransitionResult> {
    return this.withTransitionLock(this.key(userId, jobId), async () => {
      const existing = await this.get(userId, jobId);
      if (!existing) {
        return { status: 'not_found' };
      }
      if (existing.phase !== 'awaiting_confirmation') {
        return { status: 'conflict', job: existing };
      }
      const updated = await this.patch(userId, jobId, { phase: 'queued' });
      if (!updated) {
        return { status: 'not_found' };
      }
      return { status: 'started', job: updated };
    });
  }
}
