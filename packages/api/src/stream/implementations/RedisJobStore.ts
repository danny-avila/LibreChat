import { logger } from '@librechat/data-schemas';
import { createContentAggregator } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type { Redis, Cluster } from 'ioredis';
import type { IJobStore, SerializableJobData, JobStatus } from '~/stream/interfaces/IJobStore';

/**
 * Key prefixes for Redis storage.
 * All keys include the streamId for easy cleanup.
 * Note: streamId === conversationId, so no separate mapping needed.
 */
const KEYS = {
  /** Job metadata: stream:job:{streamId} */
  job: (streamId: string) => `stream:job:${streamId}`,
  /** Chunk stream (Redis Streams): stream:chunks:{streamId} */
  chunks: (streamId: string) => `stream:chunks:${streamId}`,
  /** Run steps: stream:runsteps:{streamId} */
  runSteps: (streamId: string) => `stream:runsteps:${streamId}`,
  /** Running jobs set for cleanup */
  runningJobs: 'stream:running',
};

/**
 * Default TTL values in seconds
 */
const TTL = {
  /** TTL for completed jobs (5 minutes) */
  completed: 300,
  /** TTL for running jobs (30 minutes - failsafe) */
  running: 1800,
  /** TTL for chunks stream (5 minutes after completion) */
  chunks: 300,
  /** TTL for run steps (5 minutes after completion) */
  runSteps: 300,
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
export class RedisJobStore implements IJobStore {
  private redis: Redis | Cluster;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /** Cleanup interval in ms (1 minute) */
  private cleanupIntervalMs = 60000;

  constructor(redis: Redis | Cluster) {
    this.redis = redis;
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
    const pipeline = this.redis.pipeline();

    // Store job as hash
    pipeline.hmset(key, this.serializeJob(job));
    pipeline.expire(key, TTL.running);

    // Add to running jobs set
    pipeline.sadd(KEYS.runningJobs, streamId);

    await pipeline.exec();

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
    if (updates.status && ['complete', 'error', 'aborted'].includes(updates.status)) {
      const pipeline = this.redis.pipeline();
      pipeline.expire(key, TTL.completed);
      pipeline.srem(KEYS.runningJobs, streamId);

      // Also set TTL on related keys
      pipeline.expire(KEYS.chunks(streamId), TTL.chunks);
      pipeline.expire(KEYS.runSteps(streamId), TTL.runSteps);

      await pipeline.exec();
    }
  }

  async deleteJob(streamId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(KEYS.job(streamId));
    pipeline.del(KEYS.chunks(streamId));
    pipeline.del(KEYS.runSteps(streamId));
    pipeline.srem(KEYS.runningJobs, streamId);
    await pipeline.exec();
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

    for (const streamId of streamIds) {
      const job = await this.getJob(streamId);

      // Job no longer exists (TTL expired) - remove from set
      if (!job) {
        await this.redis.srem(KEYS.runningJobs, streamId);
        cleaned++;
        continue;
      }

      // Job completed but still in running set (shouldn't happen, but handle it)
      if (job.status !== 'running') {
        await this.redis.srem(KEYS.runningJobs, streamId);
        cleaned++;
        continue;
      }

      // Stale running job (failsafe - running for > 30 minutes)
      if (now - job.createdAt > TTL.running * 1000) {
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

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Don't close the Redis connection - it's shared
    logger.info('[RedisJobStore] Destroyed');
  }

  // ===== Content State Methods =====
  // For Redis, graph/contentParts are NOT stored locally.
  // Content is reconstructed from chunks on demand.

  /**
   * No-op for Redis - graph can't be serialized/transferred.
   * Content is reconstructed from chunks instead.
   */
  setGraph(): void {
    // No-op: Redis uses chunks for content reconstruction
  }

  /**
   * No-op for Redis - content is built from chunks.
   */
  setContentParts(): void {
    // No-op: Redis uses chunks for content reconstruction
  }

  /**
   * For Redis, this returns null - caller should use getAggregatedContentAsync().
   * This sync method exists for interface compatibility with in-memory.
   *
   * Note: GenerationJobManager should check for null and call the async version.
   */
  getContentParts(): Agents.MessageContentComplex[] | null {
    // Redis can't return content synchronously - must use chunks
    return null;
  }

  /**
   * Get aggregated content from chunks (async version for Redis).
   * Called on client reconnection to reconstruct message content.
   */
  async getAggregatedContentAsync(
    streamId: string,
  ): Promise<Agents.MessageContentComplex[] | null> {
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
    return filtered;
  }

  /**
   * For Redis, run steps must be fetched async.
   * This sync method returns empty - caller should use getRunStepsAsync().
   */
  getRunSteps(): Agents.RunStep[] {
    // Redis can't return run steps synchronously
    return [];
  }

  /**
   * Get run steps (async version for Redis).
   */
  async getRunStepsAsync(streamId: string): Promise<Agents.RunStep[]> {
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
   */
  clearContentState(streamId: string): void {
    // Fire and forget - async cleanup
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
   */
  async appendChunk(streamId: string, event: unknown): Promise<void> {
    const key = KEYS.chunks(streamId);
    await this.redis.xadd(key, '*', 'event', JSON.stringify(event));
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
    await this.redis.set(key, JSON.stringify(runSteps), 'EX', TTL.running);
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
