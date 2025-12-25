import { logger } from '@librechat/data-schemas';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type { IJobStore, SerializableJobData, JobStatus } from '~/stream/interfaces/IJobStore';

/**
 * Content state for a job - volatile, in-memory only.
 * Uses WeakRef to allow garbage collection of graph when no longer needed.
 */
interface ContentState {
  contentParts: Agents.MessageContentComplex[];
  graphRef: WeakRef<StandardGraph> | null;
}

/**
 * In-memory implementation of IJobStore.
 * Suitable for single-instance deployments.
 * For horizontal scaling, use RedisJobStore.
 *
 * Content state is tied to jobs:
 * - Uses WeakRef to graph for live access to contentParts and contentData (run steps)
 * - No chunk persistence needed - same instance handles generation and reconnects
 */
export class InMemoryJobStore implements IJobStore {
  private jobs = new Map<string, SerializableJobData>();
  private contentState = new Map<string, ContentState>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /** Maps userId -> Set of streamIds (conversationIds) for active jobs */
  private userJobMap = new Map<string, Set<string>>();

  /** Time to keep completed jobs before cleanup (0 = immediate) */
  private ttlAfterComplete = 0;

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

  async initialize(): Promise<void> {
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
    if (this.jobs.size >= this.maxJobs) {
      await this.evictOldest();
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

    // Track job by userId for efficient user-scoped queries
    let userJobs = this.userJobMap.get(userId);
    if (!userJobs) {
      userJobs = new Set();
      this.userJobMap.set(userId, userJobs);
    }
    userJobs.add(streamId);

    logger.debug(`[InMemoryJobStore] Created job: ${streamId}`);

    return job;
  }

  async getJob(streamId: string): Promise<SerializableJobData | null> {
    return this.jobs.get(streamId) ?? null;
  }

  async updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void> {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    Object.assign(job, updates);
  }

  async deleteJob(streamId: string): Promise<void> {
    this.jobs.delete(streamId);
    this.contentState.delete(streamId);
    logger.debug(`[InMemoryJobStore] Deleted job: ${streamId}`);
  }

  async hasJob(streamId: string): Promise<boolean> {
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
      if (isFinished && job.completedAt) {
        // TTL of 0 means immediate cleanup, otherwise wait for TTL to expire
        if (this.ttlAfterComplete === 0 || now - job.completedAt > this.ttlAfterComplete) {
          toDelete.push(streamId);
        }
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
      await this.deleteJob(oldestId);
    }
  }

  /** Get job count (for monitoring) */
  async getJobCount(): Promise<number> {
    return this.jobs.size;
  }

  /** Get job count by status (for monitoring) */
  async getJobCountByStatus(status: JobStatus): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === status) {
        count++;
      }
    }
    return count;
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.jobs.clear();
    this.contentState.clear();
    this.userJobMap.clear();
    logger.debug('[InMemoryJobStore] Destroyed');
  }

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Also performs self-healing cleanup: removes stale entries for jobs that no longer exist.
   */
  async getActiveJobIdsByUser(userId: string): Promise<string[]> {
    const trackedIds = this.userJobMap.get(userId);
    if (!trackedIds || trackedIds.size === 0) {
      return [];
    }

    const activeIds: string[] = [];

    for (const streamId of trackedIds) {
      const job = this.jobs.get(streamId);
      // Only include if job exists AND is still running
      if (job && job.status === 'running') {
        activeIds.push(streamId);
      } else {
        // Self-healing: job completed/deleted but mapping wasn't cleaned - fix it now
        trackedIds.delete(streamId);
      }
    }

    // Clean up empty set
    if (trackedIds.size === 0) {
      this.userJobMap.delete(userId);
    }

    return activeIds;
  }

  // ===== Content State Methods =====

  /**
   * Set the graph reference for a job.
   * Uses WeakRef to allow garbage collection when graph is no longer needed.
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    const existing = this.contentState.get(streamId);
    if (existing) {
      existing.graphRef = new WeakRef(graph);
    } else {
      this.contentState.set(streamId, {
        contentParts: [],
        graphRef: new WeakRef(graph),
      });
    }
  }

  /**
   * Set content parts reference for a job.
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    const existing = this.contentState.get(streamId);
    if (existing) {
      existing.contentParts = contentParts;
    } else {
      this.contentState.set(streamId, { contentParts, graphRef: null });
    }
  }

  /**
   * Get content parts for a job.
   * Returns live content from stored reference.
   */
  async getContentParts(streamId: string): Promise<{
    content: Agents.MessageContentComplex[];
  } | null> {
    const state = this.contentState.get(streamId);
    if (!state?.contentParts) {
      return null;
    }
    return {
      content: state.contentParts,
    };
  }

  /**
   * Get run steps for a job from graph.contentData.
   * Uses WeakRef - may return empty if graph has been GC'd.
   */
  async getRunSteps(streamId: string): Promise<Agents.RunStep[]> {
    const state = this.contentState.get(streamId);
    if (!state?.graphRef) {
      return [];
    }

    // Dereference WeakRef - may return undefined if GC'd
    const graph = state.graphRef.deref();
    return graph?.contentData ?? [];
  }

  /**
   * No-op for in-memory - content available via graph reference.
   */
  async appendChunk(): Promise<void> {
    // No-op: content available via graph reference
  }

  /**
   * Clear content state for a job.
   */
  clearContentState(streamId: string): void {
    this.contentState.delete(streamId);
  }
}
