import { logger } from '@librechat/data-schemas';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type {
  SerializableJobData,
  SteerQueueItem,
  UsageMetadata,
  IJobStore,
  JobStatus,
  JobStatusTransition,
  IdempotencyClaimValue,
  IdempotencyClaimResult,
} from '~/stream/interfaces/IJobStore';
import {
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_ENQUEUE_QUEUE_FULL,
  STEER_QUEUE_MAX_DEPTH,
  isPendingActionStale,
} from '~/stream/interfaces/IJobStore';
import { toPendingSteer } from '~/stream/SteeringLifecycle';

/** Recovery window for parked steers (mirrors Redis's completed-job TTL). */
export const PARKED_STEERS_TTL_MS: number = 5 * 60 * 1000;

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

  /** Maps streamId -> FIFO queue of pending steer messages. */
  private steerQueues = new Map<string, SteerQueueItem[]>();

  /** Stream ids whose steer queue was closed by a terminal drain. Reopened by createJob. */
  private closedSteerQueues = new Set<string>();

  /** Parked terminally-drained steers — lifecycle-independent of `jobs` (the
   *  default completeJob path deletes the job record immediately). */
  private parkedSteers = new Map<string, { payload: string; expiresAt: number }>();

  /** Maps idempotency key -> claimed stream + expiry, deduping retried start requests. */
  private idempotencyClaims = new Map<
    string,
    { value: IdempotencyClaimValue; expiresAt: number }
  >();

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
    // Steer queues are keyed by streamId only, so a replacement must not
    // inherit the replaced run's undrained steers (or its closed flag), and
    // parked recovery belongs to the replaced run (a live client started this).
    this.steerQueues.delete(streamId);
    this.closedSteerQueues.delete(streamId);
    this.parkedSteers.delete(streamId);

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
    // Plain field writer. Membership-aware status transitions
    // (running ⇄ requires_action) go solely through transitionStatus.
    Object.assign(job, updates);
  }

  /**
   * Atomic in-memory: the single-threaded event loop makes the
   * read-check-write sequence indivisible, so the status guard is exact.
   * Membership/counts derive from `job.status` directly, so there are no
   * sets to reconcile here.
   */
  async transitionStatus(streamId: string, args: JobStatusTransition): Promise<boolean> {
    const job = this.jobs.get(streamId);
    if (!job || job.status !== args.from) {
      return false;
    }
    if (args.expectActionId != null && job.pendingActionId !== args.expectActionId) {
      return false;
    }
    job.status = args.to;
    if (args.patch) {
      Object.assign(job, args.patch);
    }
    for (const field of args.clear ?? []) {
      delete job[field];
    }
    return true;
  }

  async claimIdempotencyKey(
    key: string,
    value: IdempotencyClaimValue,
    ttlSeconds: number,
  ): Promise<IdempotencyClaimResult> {
    const now = Date.now();
    const existing = this.idempotencyClaims.get(key);
    if (existing && existing.expiresAt > now) {
      return { claimed: false, existing: existing.value };
    }
    this.idempotencyClaims.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return { claimed: true };
  }

  async releaseIdempotencyKey(key: string): Promise<void> {
    this.idempotencyClaims.delete(key);
  }

  async deleteJob(streamId: string): Promise<void> {
    this.jobs.delete(streamId);
    this.contentState.delete(streamId);
    this.lastActivity.delete(streamId);
    this.steerQueues.delete(streamId);
    this.closedSteerQueues.delete(streamId);
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

    // Expired parked steers are otherwise only purged by a claim.
    for (const [streamId, parked] of this.parkedSteers) {
      if (parked.expiresAt <= now) {
        this.parkedSteers.delete(streamId);
      }
    }

    // Idempotency keys are unique per submission, so expired claims are never
    // overwritten — prune them here to keep the map bounded.
    for (const [key, claim] of this.idempotencyClaims) {
      if (claim.expiresAt <= now) {
        this.idempotencyClaims.delete(key);
      }
    }

    for (const [streamId, job] of this.jobs) {
      const isFinished = ['complete', 'error', 'aborted'].includes(job.status);
      if (isFinished && job.completedAt) {
        // TTL of 0 means immediate cleanup, otherwise wait for TTL to expire
        if (this.ttlAfterComplete === 0 || now - job.completedAt > this.ttlAfterComplete) {
          toDelete.push(streamId);
        }
      } else if (job.status === 'requires_action' && isPendingActionStale(job)) {
        // Stale approval (expired, or missing/malformed pendingAction):
        // finalize it (aborted) so it stops occupying the user slot and its
        // content state is reclaimed, mirroring ApprovalLifecycle.expire().
        // Skipping it (active-list filter) alone would leave it resident.
        // 202-accepted steers frozen across the pause are parked first —
        // deleting the job would silently drop them otherwise.
        this.parkQueuedSteers(streamId, job, now);
        job.status = 'aborted';
        job.completedAt = now;
        job.error = 'Approval expired before a decision was made';
        delete job.pendingAction;
        delete job.pendingActionId;
        if (this.ttlAfterComplete === 0) {
          toDelete.push(streamId);
        }
      } else if (this.staleJobTimeout > 0 && job.status === 'running') {
        // Failsafe: reap jobs stuck in "running" with no generation activity for
        // longer than the stale timeout. These are crashed/hung generations that
        // never reached a terminal state; without this they accumulate their
        // content state in memory until the process OOMs. Reaping keys off the
        // most recent liveness signal (not creation time) so a long but live
        // stream is never reaped, and a just-resumed approval (fresh
        // `lastActiveAt`) wins over a stale per-chunk `lastActivity` entry.
        const lastActive = Math.max(
          this.lastActivity.get(streamId) ?? 0,
          job.lastActiveAt ?? 0,
          job.createdAt,
        );
        if (now - lastActive > this.staleJobTimeout) {
          // A crashed/hung run never reached a finalization drain — park the
          // 202-accepted queue before the delete drops it.
          this.parkQueuedSteers(streamId, job, now);
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
    this.steerQueues.clear();
    this.closedSteerQueues.clear();
    this.parkedSteers.clear();
    this.idempotencyClaims.clear();
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
      // Include running jobs and jobs paused for human review (e.g. tool approval).
      // A pending-approval job still occupies the user's conversation slot — but
      // only while its prompt is live: a past-`expiresAt` approval no longer
      // counts as active (cleanup/expiry will finalize it).
      if (job && (job.status === 'running' || job.status === 'requires_action')) {
        if (job.status === 'requires_action' && isPendingActionStale(job)) {
          continue;
        }
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

  // ===== Steering Queue Methods =====
  // Single-threaded event loop makes each read-check-write indivisible, so
  // the status guard and depth cap are exact without extra locking.

  async enqueueSteer(streamId: string, item: SteerQueueItem): Promise<number> {
    const job = this.jobs.get(streamId);
    if (!job || job.status !== 'running' || this.closedSteerQueues.has(streamId)) {
      return STEER_ENQUEUE_NOT_RUNNING;
    }
    let queue = this.steerQueues.get(streamId);
    if (!queue) {
      queue = [];
      this.steerQueues.set(streamId, queue);
    }
    if (queue.length >= STEER_QUEUE_MAX_DEPTH) {
      return STEER_ENQUEUE_QUEUE_FULL;
    }
    queue.push(item);
    return queue.length;
  }

  /** With `expectedCreatedAt`, refuses when the job was replaced — a stale
   *  run's drain must never consume (or close) a replacement job's queue. */
  async drainSteers(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]> {
    if (expectedCreatedAt != null && this.jobs.get(streamId)?.createdAt !== expectedCreatedAt) {
      return [];
    }
    const queue = this.steerQueues.get(streamId);
    if (!queue || queue.length === 0) {
      return [];
    }
    return queue.splice(0);
  }

  async closeAndDrainSteers(
    streamId: string,
    expectedCreatedAt?: number,
  ): Promise<SteerQueueItem[]> {
    if (expectedCreatedAt != null && this.jobs.get(streamId)?.createdAt !== expectedCreatedAt) {
      return [];
    }
    this.closedSteerQueues.add(streamId);
    return this.drainSteers(streamId);
  }

  async peekSteers(streamId: string): Promise<SteerQueueItem[]> {
    const queue = this.steerQueues.get(streamId);
    return queue ? [...queue] : [];
  }

  async clearSteers(streamId: string): Promise<void> {
    this.steerQueues.delete(streamId);
  }

  async removeSteer(streamId: string, steerId: string): Promise<boolean> {
    const queue = this.steerQueues.get(streamId);
    const index = queue?.findIndex((item) => item.steerId === steerId) ?? -1;
    if (queue == null || index < 0) {
      return false;
    }
    queue.splice(index, 1);
    return true;
  }

  async parkSteers(streamId: string, payload: string): Promise<void> {
    this.parkedSteers.set(streamId, {
      payload,
      expiresAt: Date.now() + PARKED_STEERS_TTL_MS,
    });
  }

  /** Non-owner fragments leave the payload untouched (mirrors the Redis Lua gate). */
  async claimParkedSteers(streamId: string, ownerFragment: string): Promise<string | undefined> {
    const parked = this.parkedSteers.get(streamId);
    if (!parked || !parked.payload.includes(ownerFragment)) {
      return undefined;
    }
    this.parkedSteers.delete(streamId);
    return parked.expiresAt > Date.now() ? parked.payload : undefined;
  }

  /** Terminal cleanup (approval expiry, stale-running reap) must not drop
   *  202-accepted steers with the job. */
  private parkQueuedSteers(streamId: string, job: SerializableJobData, now: number): void {
    const queue = this.steerQueues.get(streamId);
    if (!queue || queue.length === 0) {
      return;
    }
    this.parkedSteers.set(streamId, {
      payload: JSON.stringify({
        userId: job.userId,
        ...(job.tenantId != null && { tenantId: job.tenantId }),
        steers: queue.map(toPendingSteer),
      }),
      expiresAt: now + PARKED_STEERS_TTL_MS,
    });
    this.steerQueues.delete(streamId);
  }
}
