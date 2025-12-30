import { logger } from '@librechat/data-schemas';
import { createContentAggregator } from '@librechat/agents';
import type { IJobStore, SerializableJobData, JobStatus } from '~/stream/interfaces/IJobStore';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type { Redis, Cluster } from 'ioredis';

/**
 * Key prefixes for Redis storage.
 * All keys include the streamId for easy cleanup.
 * Note: streamId === conversationId, so no separate mapping needed.
 *
 * IMPORTANT: Uses hash tags {streamId} for Redis Cluster compatibility.
 * All keys for the same stream hash to the same slot, enabling:
 * - Pipeline operations across related keys
 * - Atomic multi-key operations
 */
const KEYS = {
  /** Job metadata: stream:{streamId}:job */
  job: (streamId: string) => `stream:{${streamId}}:job`,
  /** Chunk stream (Redis Streams): stream:{streamId}:chunks */
  chunks: (streamId: string) => `stream:{${streamId}}:chunks`,
  /** Run steps: stream:{streamId}:runsteps */
  runSteps: (streamId: string) => `stream:{${streamId}}:runsteps`,
  /** Running jobs set for cleanup (global set - single slot) */
  runningJobs: 'stream:running',
  /** User's active jobs set: stream:user:{userId}:jobs */
  userJobs: (userId: string) => `stream:user:{${userId}}:jobs`,
};

/**
 * Default TTL values in seconds.
 * Can be overridden via constructor options.
 */
const DEFAULT_TTL = {
  /** TTL for completed jobs (5 minutes) */
  completed: 300,
  /** TTL for running jobs/chunks (20 minutes - failsafe for crashed jobs) */
  running: 1200,
  /** TTL for chunks after completion (0 = delete immediately) */
  chunksAfterComplete: 0,
  /** TTL for run steps after completion (0 = delete immediately) */
  runStepsAfterComplete: 0,
};

/**
 * Redis implementation of IJobStore.
 * Enables horizontal scaling with multi-instance deployments.
 *
 * Storage strategy:
 * - Job metadata: Redis Hash (fast field access)
 * - Chunks: Redis Streams (append-only, efficient for streaming)
 * - Run steps: Redis String (JSON serialized)
 *
 * Note: streamId === conversationId, so getJob(conversationId) works directly.
 *
 * @example
 * ```ts
 * import { ioredisClient } from '~/cache';
 * const store = new RedisJobStore(ioredisClient);
 * await store.initialize();
 * ```
 */
/**
 * Configuration options for RedisJobStore
 */
export interface RedisJobStoreOptions {
  /** TTL for completed jobs in seconds (default: 300 = 5 minutes) */
  completedTtl?: number;
  /** TTL for running jobs/chunks in seconds (default: 1200 = 20 minutes) */
  runningTtl?: number;
  /** TTL for chunks after completion in seconds (default: 0 = delete immediately) */
  chunksAfterCompleteTtl?: number;
  /** TTL for run steps after completion in seconds (default: 0 = delete immediately) */
  runStepsAfterCompleteTtl?: number;
}

export class RedisJobStore implements IJobStore {
  private redis: Redis | Cluster;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private ttl: typeof DEFAULT_TTL;

  /** Whether Redis client is in cluster mode (affects pipeline usage) */
  private isCluster: boolean;

  /**
   * Local cache for graph references on THIS instance.
   * Enables fast reconnects when client returns to the same server.
   * Uses WeakRef to allow garbage collection when graph is no longer needed.
   */
  private localGraphCache = new Map<string, WeakRef<StandardGraph>>();

  /** Cleanup interval in ms (1 minute) */
  private cleanupIntervalMs = 60000;

  constructor(redis: Redis | Cluster, options?: RedisJobStoreOptions) {
    this.redis = redis;
    this.ttl = {
      completed: options?.completedTtl ?? DEFAULT_TTL.completed,
      running: options?.runningTtl ?? DEFAULT_TTL.running,
      chunksAfterComplete: options?.chunksAfterCompleteTtl ?? DEFAULT_TTL.chunksAfterComplete,
      runStepsAfterComplete: options?.runStepsAfterCompleteTtl ?? DEFAULT_TTL.runStepsAfterComplete,
    };
    // Detect cluster mode using ioredis's isCluster property
    this.isCluster = (redis as Cluster).isCluster === true;
  }

  async initialize(): Promise<void> {
    if (this.cleanupInterval) {
      return;
    }

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch((err) => {
        logger.error('[RedisJobStore] Cleanup error:', err);
      });
    }, this.cleanupIntervalMs);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.info('[RedisJobStore] Initialized with cleanup interval');
  }

  async createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
  ): Promise<SerializableJobData> {
    const job: SerializableJobData = {
      streamId,
      userId,
      status: 'running',
      createdAt: Date.now(),
      conversationId,
      syncSent: false,
    };

    const key = KEYS.job(streamId);
    const userJobsKey = KEYS.userJobs(userId);

    // For cluster mode, we can't pipeline keys on different slots
    // The job key uses hash tag {streamId}, runningJobs and userJobs are on different slots
    if (this.isCluster) {
      await this.redis.hmset(key, this.serializeJob(job));
      await this.redis.expire(key, this.ttl.running);
      await this.redis.sadd(KEYS.runningJobs, streamId);
      await this.redis.sadd(userJobsKey, streamId);
    } else {
      const pipeline = this.redis.pipeline();
      pipeline.hmset(key, this.serializeJob(job));
      pipeline.expire(key, this.ttl.running);
      pipeline.sadd(KEYS.runningJobs, streamId);
      pipeline.sadd(userJobsKey, streamId);
      await pipeline.exec();
    }

    logger.debug(`[RedisJobStore] Created job: ${streamId}`);
    return job;
  }

  async getJob(streamId: string): Promise<SerializableJobData | null> {
    const data = await this.redis.hgetall(KEYS.job(streamId));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.deserializeJob(data);
  }

  async updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void> {
    const key = KEYS.job(streamId);
    const exists = await this.redis.exists(key);
    if (!exists) {
      return;
    }

    const serialized = this.serializeJob(updates as SerializableJobData);
    if (Object.keys(serialized).length === 0) {
      return;
    }

    await this.redis.hmset(key, serialized);

    // If status changed to complete/error/aborted, update TTL and remove from running set
    // Note: userJobs cleanup is handled lazily via self-healing in getActiveJobIdsByUser
    if (updates.status && ['complete', 'error', 'aborted'].includes(updates.status)) {
      // In cluster mode, separate runningJobs (global) from stream-specific keys
      if (this.isCluster) {
        await this.redis.expire(key, this.ttl.completed);
        await this.redis.srem(KEYS.runningJobs, streamId);

        if (this.ttl.chunksAfterComplete === 0) {
          await this.redis.del(KEYS.chunks(streamId));
        } else {
          await this.redis.expire(KEYS.chunks(streamId), this.ttl.chunksAfterComplete);
        }

        if (this.ttl.runStepsAfterComplete === 0) {
          await this.redis.del(KEYS.runSteps(streamId));
        } else {
          await this.redis.expire(KEYS.runSteps(streamId), this.ttl.runStepsAfterComplete);
        }
      } else {
        const pipeline = this.redis.pipeline();
        pipeline.expire(key, this.ttl.completed);
        pipeline.srem(KEYS.runningJobs, streamId);

        if (this.ttl.chunksAfterComplete === 0) {
          pipeline.del(KEYS.chunks(streamId));
        } else {
          pipeline.expire(KEYS.chunks(streamId), this.ttl.chunksAfterComplete);
        }

        if (this.ttl.runStepsAfterComplete === 0) {
          pipeline.del(KEYS.runSteps(streamId));
        } else {
          pipeline.expire(KEYS.runSteps(streamId), this.ttl.runStepsAfterComplete);
        }

        await pipeline.exec();
      }
    }
  }

  async deleteJob(streamId: string): Promise<void> {
    // Clear local caches
    this.localGraphCache.delete(streamId);

    // Note: userJobs cleanup is handled lazily via self-healing in getActiveJobIdsByUser
    // In cluster mode, separate runningJobs (global) from stream-specific keys (same slot)
    if (this.isCluster) {
      // Stream-specific keys all hash to same slot due to {streamId}
      const pipeline = this.redis.pipeline();
      pipeline.del(KEYS.job(streamId));
      pipeline.del(KEYS.chunks(streamId));
      pipeline.del(KEYS.runSteps(streamId));
      await pipeline.exec();
      // Global set is on different slot - execute separately
      await this.redis.srem(KEYS.runningJobs, streamId);
    } else {
      const pipeline = this.redis.pipeline();
      pipeline.del(KEYS.job(streamId));
      pipeline.del(KEYS.chunks(streamId));
      pipeline.del(KEYS.runSteps(streamId));
      pipeline.srem(KEYS.runningJobs, streamId);
      await pipeline.exec();
    }
    logger.debug(`[RedisJobStore] Deleted job: ${streamId}`);
  }

  async hasJob(streamId: string): Promise<boolean> {
    const exists = await this.redis.exists(KEYS.job(streamId));
    return exists === 1;
  }

  async getRunningJobs(): Promise<SerializableJobData[]> {
    const streamIds = await this.redis.smembers(KEYS.runningJobs);
    if (streamIds.length === 0) {
      return [];
    }

    const jobs: SerializableJobData[] = [];
    for (const streamId of streamIds) {
      const job = await this.getJob(streamId);
      if (job && job.status === 'running') {
        jobs.push(job);
      }
    }
    return jobs;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    const streamIds = await this.redis.smembers(KEYS.runningJobs);
    let cleaned = 0;

    // Clean up stale local graph cache entries (WeakRefs that were collected)
    for (const [streamId, graphRef] of this.localGraphCache) {
      if (!graphRef.deref()) {
        this.localGraphCache.delete(streamId);
      }
    }

    for (const streamId of streamIds) {
      const job = await this.getJob(streamId);

      // Job no longer exists (TTL expired) - remove from set
      if (!job) {
        await this.redis.srem(KEYS.runningJobs, streamId);
        this.localGraphCache.delete(streamId);
        cleaned++;
        continue;
      }

      // Job completed but still in running set (shouldn't happen, but handle it)
      if (job.status !== 'running') {
        await this.redis.srem(KEYS.runningJobs, streamId);
        this.localGraphCache.delete(streamId);
        cleaned++;
        continue;
      }

      // Stale running job (failsafe - running for > configured TTL)
      if (now - job.createdAt > this.ttl.running * 1000) {
        logger.warn(`[RedisJobStore] Cleaning up stale job: ${streamId}`);
        await this.deleteJob(streamId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[RedisJobStore] Cleaned up ${cleaned} jobs`);
    }

    return cleaned;
  }

  async getJobCount(): Promise<number> {
    // This is approximate - counts jobs in running set + scans for job keys
    // For exact count, would need to scan all job:* keys
    const runningCount = await this.redis.scard(KEYS.runningJobs);
    return runningCount;
  }

  async getJobCountByStatus(status: JobStatus): Promise<number> {
    if (status === 'running') {
      return this.redis.scard(KEYS.runningJobs);
    }

    // For other statuses, we'd need to scan - return 0 for now
    // In production, consider maintaining separate sets per status if needed
    return 0;
  }

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Also performs self-healing cleanup: removes stale entries for jobs that no longer exist.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  async getActiveJobIdsByUser(userId: string): Promise<string[]> {
    const userJobsKey = KEYS.userJobs(userId);
    const trackedIds = await this.redis.smembers(userJobsKey);

    if (trackedIds.length === 0) {
      return [];
    }

    const activeIds: string[] = [];
    const staleIds: string[] = [];

    for (const streamId of trackedIds) {
      const job = await this.getJob(streamId);
      // Only include if job exists AND is still running
      if (job && job.status === 'running') {
        activeIds.push(streamId);
      } else {
        // Self-healing: job completed/deleted but mapping wasn't cleaned - mark for removal
        staleIds.push(streamId);
      }
    }

    // Clean up stale entries
    if (staleIds.length > 0) {
      await this.redis.srem(userJobsKey, ...staleIds);
      logger.debug(
        `[RedisJobStore] Self-healed ${staleIds.length} stale job entries for user ${userId}`,
      );
    }

    return activeIds;
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear local caches
    this.localGraphCache.clear();
    // Don't close the Redis connection - it's shared
    logger.info('[RedisJobStore] Destroyed');
  }

  // ===== Content State Methods =====
  // For Redis, content is primarily reconstructed from chunks.
  // However, we keep a LOCAL graph cache for fast same-instance reconnects.

  /**
   * Store graph reference in local cache.
   * This enables fast reconnects when client returns to the same instance.
   * Falls back to Redis chunk reconstruction for cross-instance reconnects.
   *
   * @param streamId - The stream identifier
   * @param graph - The graph instance (stored as WeakRef)
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    this.localGraphCache.set(streamId, new WeakRef(graph));
  }

  /**
   * No-op for Redis - content parts are reconstructed from chunks.
   * Metadata (agentId, groupId) is embedded directly on content parts by the agent runtime.
   */
  setContentParts(_streamId: string, _contentParts: Agents.MessageContentComplex[]): void {
    // Content parts are reconstructed from chunks during getContentParts
    // No separate storage needed
  }

  /**
   * Get aggregated content - tries local cache first, falls back to Redis reconstruction.
   *
   * Optimization: If this instance has the live graph (same-instance reconnect),
   * we return the content directly without Redis round-trip.
   * For cross-instance reconnects, we reconstruct from Redis Streams.
   *
   * @param streamId - The stream identifier
   * @returns Content parts array or null if not found
   */
  async getContentParts(streamId: string): Promise<{
    content: Agents.MessageContentComplex[];
  } | null> {
    // 1. Try local graph cache first (fast path for same-instance reconnect)
    const graphRef = this.localGraphCache.get(streamId);
    if (graphRef) {
      const graph = graphRef.deref();
      if (graph) {
        const localParts = graph.getContentParts();
        if (localParts && localParts.length > 0) {
          return {
            content: localParts,
          };
        }
      } else {
        // WeakRef was collected, remove from cache
        this.localGraphCache.delete(streamId);
      }
    }

    // 2. Fall back to Redis chunk reconstruction (cross-instance reconnect)
    const chunks = await this.getChunks(streamId);
    if (chunks.length === 0) {
      return null;
    }

    // Use the same content aggregator as live streaming
    const { contentParts, aggregateContent } = createContentAggregator();

    // Valid event types for content aggregation
    const validEvents = new Set([
      'on_run_step',
      'on_message_delta',
      'on_reasoning_delta',
      'on_run_step_delta',
      'on_run_step_completed',
      'on_agent_update',
    ]);

    for (const chunk of chunks) {
      const event = chunk as { event?: string; data?: unknown };
      if (!event.event || !event.data || !validEvents.has(event.event)) {
        continue;
      }

      // Pass event string directly - GraphEvents values are lowercase strings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aggregateContent({ event: event.event as any, data: event.data as any });
    }

    // Filter out undefined entries
    const filtered: Agents.MessageContentComplex[] = [];
    for (const part of contentParts) {
      if (part !== undefined) {
        filtered.push(part);
      }
    }

    return {
      content: filtered,
    };
  }

  /**
   * Get run steps - tries local cache first, falls back to Redis.
   *
   * Optimization: If this instance has the live graph, we get run steps
   * directly without Redis round-trip.
   *
   * @param streamId - The stream identifier
   * @returns Run steps array
   */
  async getRunSteps(streamId: string): Promise<Agents.RunStep[]> {
    // 1. Try local graph cache first (fast path for same-instance reconnect)
    const graphRef = this.localGraphCache.get(streamId);
    if (graphRef) {
      const graph = graphRef.deref();
      if (graph) {
        const localSteps = graph.getRunSteps();
        if (localSteps && localSteps.length > 0) {
          return localSteps;
        }
      }
      // Note: Don't delete from cache here - graph may still be valid
      // but just not have run steps yet
    }

    // 2. Fall back to Redis (cross-instance reconnect)
    const key = KEYS.runSteps(streamId);
    const data = await this.redis.get(key);
    if (!data) {
      return [];
    }
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Clear content state for a job.
   * Removes both local cache and Redis data.
   */
  clearContentState(streamId: string): void {
    // Clear local caches immediately
    this.localGraphCache.delete(streamId);

    // Fire and forget - async cleanup for Redis
    this.clearContentStateAsync(streamId).catch((err) => {
      logger.error(`[RedisJobStore] Failed to clear content state for ${streamId}:`, err);
    });
  }

  /**
   * Clear content state async.
   */
  private async clearContentStateAsync(streamId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(KEYS.chunks(streamId));
    pipeline.del(KEYS.runSteps(streamId));
    await pipeline.exec();
  }

  /**
   * Append a streaming chunk to Redis Stream.
   * Uses XADD for efficient append-only storage.
   * Sets TTL on first chunk to ensure cleanup if job crashes.
   */
  async appendChunk(streamId: string, event: unknown): Promise<void> {
    const key = KEYS.chunks(streamId);
    const added = await this.redis.xadd(key, '*', 'event', JSON.stringify(event));

    // Set TTL on first chunk (when stream is created)
    // Subsequent chunks inherit the stream's TTL
    if (added) {
      const len = await this.redis.xlen(key);
      if (len === 1) {
        await this.redis.expire(key, this.ttl.running);
      }
    }
  }

  /**
   * Get all chunks from Redis Stream.
   */
  private async getChunks(streamId: string): Promise<unknown[]> {
    const key = KEYS.chunks(streamId);
    const entries = await this.redis.xrange(key, '-', '+');

    return entries
      .map(([, fields]) => {
        const eventIdx = fields.indexOf('event');
        if (eventIdx >= 0 && eventIdx + 1 < fields.length) {
          try {
            return JSON.parse(fields[eventIdx + 1]);
          } catch {
            return null;
          }
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Save run steps for resume state.
   */
  async saveRunSteps(streamId: string, runSteps: Agents.RunStep[]): Promise<void> {
    const key = KEYS.runSteps(streamId);
    await this.redis.set(key, JSON.stringify(runSteps), 'EX', this.ttl.running);
  }

  // ===== Consumer Group Methods =====
  // These enable tracking which chunks each client has seen.
  // Based on https://upstash.com/blog/resumable-llm-streams

  /**
   * Create a consumer group for a stream.
   * Used to track which chunks a client has already received.
   *
   * @param streamId - The stream identifier
   * @param groupName - Unique name for the consumer group (e.g., session ID)
   * @param startFrom - Where to start reading ('0' = from beginning, '$' = only new)
   */
  async createConsumerGroup(
    streamId: string,
    groupName: string,
    startFrom: '0' | '$' = '0',
  ): Promise<void> {
    const key = KEYS.chunks(streamId);
    try {
      await this.redis.xgroup('CREATE', key, groupName, startFrom, 'MKSTREAM');
      logger.debug(`[RedisJobStore] Created consumer group ${groupName} for ${streamId}`);
    } catch (err) {
      // BUSYGROUP error means group already exists - that's fine
      const error = err as Error;
      if (!error.message?.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  /**
   * Read chunks from a consumer group (only unseen chunks).
   * This is the key to the resumable stream pattern.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param consumerName - Name of the consumer within the group
   * @param count - Maximum number of chunks to read (default: all available)
   * @returns Array of { id, event } where id is the Redis stream entry ID
   */
  async readChunksFromGroup(
    streamId: string,
    groupName: string,
    consumerName: string = 'consumer-1',
    count?: number,
  ): Promise<Array<{ id: string; event: unknown }>> {
    const key = KEYS.chunks(streamId);

    try {
      // XREADGROUP GROUP groupName consumerName [COUNT count] STREAMS key >
      // The '>' means only read new messages not yet delivered to this consumer
      let result;
      if (count) {
        result = await this.redis.xreadgroup(
          'GROUP',
          groupName,
          consumerName,
          'COUNT',
          count,
          'STREAMS',
          key,
          '>',
        );
      } else {
        result = await this.redis.xreadgroup('GROUP', groupName, consumerName, 'STREAMS', key, '>');
      }

      if (!result || result.length === 0) {
        return [];
      }

      // Result format: [[streamKey, [[id, [field, value, ...]], ...]]]
      const [, messages] = result[0] as [string, Array<[string, string[]]>];
      const chunks: Array<{ id: string; event: unknown }> = [];

      for (const [id, fields] of messages) {
        const eventIdx = fields.indexOf('event');
        if (eventIdx >= 0 && eventIdx + 1 < fields.length) {
          try {
            chunks.push({
              id,
              event: JSON.parse(fields[eventIdx + 1]),
            });
          } catch {
            // Skip malformed entries
          }
        }
      }

      return chunks;
    } catch (err) {
      const error = err as Error;
      // NOGROUP error means the group doesn't exist yet
      if (error.message?.includes('NOGROUP')) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Acknowledge that chunks have been processed.
   * This tells Redis we've successfully delivered these chunks to the client.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param messageIds - Array of Redis stream entry IDs to acknowledge
   */
  async acknowledgeChunks(
    streamId: string,
    groupName: string,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    const key = KEYS.chunks(streamId);
    await this.redis.xack(key, groupName, ...messageIds);
  }

  /**
   * Delete a consumer group.
   * Called when a client disconnects and won't reconnect.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name to delete
   */
  async deleteConsumerGroup(streamId: string, groupName: string): Promise<void> {
    const key = KEYS.chunks(streamId);
    try {
      await this.redis.xgroup('DESTROY', key, groupName);
      logger.debug(`[RedisJobStore] Deleted consumer group ${groupName} for ${streamId}`);
    } catch {
      // Ignore errors - group may not exist
    }
  }

  /**
   * Get pending chunks for a consumer (chunks delivered but not acknowledged).
   * Useful for recovering from crashes.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   */
  async getPendingChunks(
    streamId: string,
    groupName: string,
    consumerName: string = 'consumer-1',
  ): Promise<Array<{ id: string; event: unknown }>> {
    const key = KEYS.chunks(streamId);

    try {
      // Read pending messages (delivered but not acked) by using '0' instead of '>'
      const result = await this.redis.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'STREAMS',
        key,
        '0',
      );

      if (!result || result.length === 0) {
        return [];
      }

      const [, messages] = result[0] as [string, Array<[string, string[]]>];
      const chunks: Array<{ id: string; event: unknown }> = [];

      for (const [id, fields] of messages) {
        const eventIdx = fields.indexOf('event');
        if (eventIdx >= 0 && eventIdx + 1 < fields.length) {
          try {
            chunks.push({
              id,
              event: JSON.parse(fields[eventIdx + 1]),
            });
          } catch {
            // Skip malformed entries
          }
        }
      }

      return chunks;
    } catch {
      return [];
    }
  }

  /**
   * Serialize job data for Redis hash storage.
   * Converts complex types to strings.
   */
  private serializeJob(job: Partial<SerializableJobData>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(job)) {
      if (value === undefined) {
        continue;
      }

      if (typeof value === 'object') {
        result[key] = JSON.stringify(value);
      } else if (typeof value === 'boolean') {
        result[key] = value ? '1' : '0';
      } else {
        result[key] = String(value);
      }
    }

    return result;
  }

  /**
   * Deserialize job data from Redis hash.
   */
  private deserializeJob(data: Record<string, string>): SerializableJobData {
    return {
      streamId: data.streamId,
      userId: data.userId,
      status: data.status as JobStatus,
      createdAt: parseInt(data.createdAt, 10),
      completedAt: data.completedAt ? parseInt(data.completedAt, 10) : undefined,
      conversationId: data.conversationId || undefined,
      error: data.error || undefined,
      userMessage: data.userMessage ? JSON.parse(data.userMessage) : undefined,
      responseMessageId: data.responseMessageId || undefined,
      sender: data.sender || undefined,
      syncSent: data.syncSent === '1',
      finalEvent: data.finalEvent || undefined,
      endpoint: data.endpoint || undefined,
      iconURL: data.iconURL || undefined,
      model: data.model || undefined,
      promptTokens: data.promptTokens ? parseInt(data.promptTokens, 10) : undefined,
    };
  }
}
