import { logger } from '@librechat/data-schemas';
import type { IJobStore, SerializableJobData, JobStatus } from '../interfaces/IJobStore';

/**
 * In-memory implementation of IJobStore.
 * Suitable for single-instance deployments.
 * For horizontal scaling, use RedisJobStore.
 */
export class InMemoryJobStore implements IJobStore {
  private jobs = new Map<string, SerializableJobData>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /** Time to keep completed jobs before cleanup (5 minutes - reduced from 1 hour) */
  private ttlAfterComplete = 300000;

  /** Maximum number of concurrent jobs */
  private maxJobs = 1000;

  constructor(options?: { ttlAfterComplete?: number; maxJobs?: number }) {
    if (options?.ttlAfterComplete) {
      this.ttlAfterComplete = options.ttlAfterComplete;
    }
    if (options?.maxJobs) {
      this.maxJobs = options.maxJobs;
    }
  }

  initialize(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.debug('[InMemoryJobStore] Initialized with cleanup interval');
  }

  async createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
  ): Promise<SerializableJobData> {
    return this.createJobSync(streamId, userId, conversationId);
  }

  /** Synchronous version for in-memory use */
  createJobSync(streamId: string, userId: string, conversationId?: string): SerializableJobData {
    if (this.jobs.size >= this.maxJobs) {
      this.evictOldestSync();
    }

    const job: SerializableJobData = {
      streamId,
      userId,
      status: 'running',
      createdAt: Date.now(),
      conversationId,
      syncSent: false,
    };

    this.jobs.set(streamId, job);
    logger.debug(`[InMemoryJobStore] Created job: ${streamId}`);

    return job;
  }

  async getJob(streamId: string): Promise<SerializableJobData | null> {
    return this.getJobSync(streamId);
  }

  /** Synchronous version for in-memory use */
  getJobSync(streamId: string): SerializableJobData | null {
    return this.jobs.get(streamId) ?? null;
  }

  async getJobByConversation(conversationId: string): Promise<SerializableJobData | null> {
    return this.getJobByConversationSync(conversationId);
  }

  /** Synchronous version for in-memory use */
  getJobByConversationSync(conversationId: string): SerializableJobData | null {
    // Direct match first (streamId === conversationId for existing conversations)
    const directMatch = this.jobs.get(conversationId);
    if (directMatch && directMatch.status === 'running') {
      return directMatch;
    }

    // Search by conversationId in metadata
    for (const job of this.jobs.values()) {
      if (job.conversationId === conversationId && job.status === 'running') {
        return job;
      }
    }

    return null;
  }

  async updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void> {
    this.updateJobSync(streamId, updates);
  }

  /** Synchronous version for in-memory use */
  updateJobSync(streamId: string, updates: Partial<SerializableJobData>): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    Object.assign(job, updates);
  }

  async deleteJob(streamId: string): Promise<void> {
    this.deleteJobSync(streamId);
  }

  /** Synchronous version for in-memory use */
  deleteJobSync(streamId: string): void {
    this.jobs.delete(streamId);
    logger.debug(`[InMemoryJobStore] Deleted job: ${streamId}`);
  }

  async hasJob(streamId: string): Promise<boolean> {
    return this.hasJobSync(streamId);
  }

  /** Synchronous version for in-memory use */
  hasJobSync(streamId: string): boolean {
    return this.jobs.has(streamId);
  }

  async getRunningJobs(): Promise<SerializableJobData[]> {
    const running: SerializableJobData[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        running.push(job);
      }
    }
    return running;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [streamId, job] of this.jobs) {
      const isFinished = ['complete', 'error', 'aborted'].includes(job.status);
      if (isFinished && job.completedAt && now - job.completedAt > this.ttlAfterComplete) {
        toDelete.push(streamId);
      }
    }

    for (const id of toDelete) {
      await this.deleteJob(id);
    }

    if (toDelete.length > 0) {
      logger.debug(`[InMemoryJobStore] Cleaned up ${toDelete.length} expired jobs`);
    }

    return toDelete.length;
  }

  private async evictOldest(): Promise<void> {
    this.evictOldestSync();
  }

  /** Synchronous version for in-memory use */
  private evictOldestSync(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [streamId, job] of this.jobs) {
      if (job.createdAt < oldestTime) {
        oldestTime = job.createdAt;
        oldestId = streamId;
      }
    }

    if (oldestId) {
      logger.warn(`[InMemoryJobStore] Evicting oldest job: ${oldestId}`);
      this.deleteJobSync(oldestId);
    }
  }

  /** Get job count (for monitoring) */
  getJobCount(): number {
    return this.jobs.size;
  }

  /** Get job count by status (for monitoring) */
  getJobCountByStatus(): Record<JobStatus, number> {
    const counts: Record<JobStatus, number> = {
      running: 0,
      complete: 0,
      error: 0,
      aborted: 0,
    };

    for (const job of this.jobs.values()) {
      counts[job.status]++;
    }

    return counts;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.jobs.clear();
    logger.debug('[InMemoryJobStore] Destroyed');
  }
}
