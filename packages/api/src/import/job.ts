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

export class ImportJobStore {
  private readonly store: Keyv;
  private readonly ttl: number;

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

  async patch(userId: string, jobId: string, patch: Partial<ImportJob>): Promise<ImportJob | null> {
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
}
