import { logger } from '@librechat/data-schemas';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type {
  SerializableJobData,
  UsageMetadata,
  IJobStore,
  JobStatus,
} from '~/stream/interfaces/IJobStore';

/**
 * Content state for a job - volatile, in-memory only.
 * Uses WeakRef to allow garbage collection of graph when no longer needed.
 */
interface ContentState {
  contentParts: Agents.MessageContentComplex[];
  graphRef: WeakRef<StandardGraph> | null;
  collectedUsage: UsageMetadata[];
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

  /**
   * Maps streamId -> last generation-activity timestamp. Refreshed via
   * recordActivity() on each emitted chunk so the stale-job failsafe reaps on
   * inactivity (a hung generation) rather than age (a long but live stream).
   */
  private lastActivity = new Map<string, number>();

  /** Time to keep completed jobs before cleanup (0 = immediate) */
  private ttlAfterComplete = 0;

  /** Maximum number of concurrent jobs */
  private maxJobs = 1000;

  /**
   * Failsafe timeout (ms) for jobs stuck in "running" status. Mirrors
   * RedisJobStore's running-job TTL: a crashed or hung generation that never
   * reaches a terminal state would otherwise retain its content state forever,
   * leaking the full message context until the process runs out of memory.
   * 0 disables the failsafe. Default: 20 minutes.
   */
  private staleJobTimeout = 1_200_000;

  constructor(options?: { ttlAfterComplete?: number; maxJobs?: number; staleJobTimeout?: number }) {
    if (options?.ttlAfterComplete) {
      this.ttlAfterComplete = options.ttlAfterComplete;
    }
    if (options?.maxJobs) {
      this.maxJobs = options.maxJobs;
    }
    if (options?.staleJobTimeout !== undefined) {
      this.staleJobTimeout = options.staleJobTimeout;
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
    tenantId?: string,
  ): Promise<SerializableJobData> {
    if (this.jobs.size >= this.maxJobs) {
      await this.evictOldest();
    }

    const job: SerializableJobData = {
      streamId,
      userId,
      ...(tenantId && { tenantId }),
      status: 'running',
      createdAt: Date.now(),
      conversationId,
      syncSent: false,
    };

    this.jobs.set(streamId, job);
    // Clear any prior activity timestamp so a replacement reusing this streamId
    // (the controller handles job replacement) falls back to the fresh createdAt
    // and isn't reaped on the previous generation's stale last-activity time.
    this.lastActivity.delete(streamId);

    // Track job by userId (tenant-qualified when available) for efficient user-scoped queries
    const userKey = tenantId ? `${tenantId}:${userId}` : userId;
    let userJobs = this.userJobMap.get(userKey);
    if (!userJobs) {
      userJobs = new Set();
      this.userJobMap.set(userKey, userJobs);
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
    this.lastActivity.delete(streamId);
    logger.debug(`[InMemoryJobStore] Deleted job: ${streamId}`);
  }

  /**
   * Refresh a job's last-activity timestamp (called on each emitted chunk) so the
   * stale-job failsafe in cleanup() reaps on inactivity rather than total age,
   * mirroring RedisJobStore refreshing the running TTL on each appendChunk.
   */
  recordActivity(streamId: string): void {
    if (this.jobs.has(streamId)) {
      this.lastActivity.set(streamId, Date.now());
    }
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
    let staleRunning = 0;

    for (const [streamId, job] of this.jobs) {
      const isFinished = ['complete', 'error', 'aborted'].includes(job.status);
      if (isFinished && job.completedAt) {
        // TTL of 0 means immediate cleanup, otherwise wait for TTL to expire
        if (this.ttlAfterComplete === 0 || now - job.completedAt > this.ttlAfterComplete) {
          toDelete.push(streamId);
        }
      } else if (this.staleJobTimeout > 0 && job.status === 'running') {
        // Failsafe: reap jobs stuck in "running" with no generation activity for
        // longer than the stale timeout. These are crashed/hung generations that
        // never reached a terminal state; without this they accumulate their
        // content state in memory until the process OOMs. Reaping keys off last
        // activity (not creation time) so a long but live stream is never reaped,
        // mirroring RedisJobStore refreshing the running TTL on each chunk.
        const lastActive = this.lastActivity.get(streamId) ?? job.createdAt;
        if (now - lastActive > this.staleJobTimeout) {
          toDelete.push(streamId);
          staleRunning++;
        }
      }
    }

    for (const id of toDelete) {
      const job = this.jobs.get(id);
      if (job) {
        const userKey = job.tenantId ? `${job.tenantId}:${job.userId}` : job.userId;
        const userJobs = this.userJobMap.get(userKey);
        if (userJobs) {
          userJobs.delete(id);
          if (userJobs.size === 0) {
            this.userJobMap.delete(userKey);
          }
        }
      }
      await this.deleteJob(id);
    }

    if (staleRunning > 0) {
      logger.warn(
        `[InMemoryJobStore] Reaped ${staleRunning} stale running job(s) exceeding ${this.staleJobTimeout}ms (likely crashed/hung generations)`,
      );
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
      const job = this.jobs.get(oldestId);
      if (job) {
        const userKey = job.tenantId ? `${job.tenantId}:${job.userId}` : job.userId;
        const userJobs = this.userJobMap.get(userKey);
        if (userJobs) {
          userJobs.delete(oldestId);
          if (userJobs.size === 0) {
            this.userJobMap.delete(userKey);
          }
        }
      }
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
  async getActiveJobIdsByUser(userId: string, tenantId?: string): Promise<string[]> {
    const userKey = tenantId ? `${tenantId}:${userId}` : userId;
    const trackedIds = this.userJobMap.get(userKey);
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
      this.userJobMap.delete(userKey);
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
        collectedUsage: [],
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
      this.contentState.set(streamId, { contentParts, graphRef: null, collectedUsage: [] });
    }
  }

  /**
   * Set collected usage reference for a job.
   */
  setCollectedUsage(streamId: string, collectedUsage: UsageMetadata[]): void {
    const existing = this.contentState.get(streamId);
    if (existing) {
      existing.collectedUsage = collectedUsage;
    } else {
      this.contentState.set(streamId, { contentParts: [], graphRef: null, collectedUsage });
    }
  }

  /**
   * Get collected usage for a job.
   */
  getCollectedUsage(streamId: string): UsageMetadata[] {
    const state = this.contentState.get(streamId);
    return state?.collectedUsage ?? [];
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
