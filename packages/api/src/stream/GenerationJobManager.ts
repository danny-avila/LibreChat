import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { ServerSentEvent } from '~/types';
import type {
  GenerationJob,
  GenerationJobStatus,
  ChunkHandler,
  DoneHandler,
  ErrorHandler,
  UnsubscribeFn,
} from './types';

/**
 * Manages generation jobs for resumable LLM streams.
 * Generation runs independently of HTTP connections via EventEmitter.
 * Clients can subscribe/unsubscribe to job events without affecting generation.
 */
class GenerationJobManagerClass {
  private jobs = new Map<string, GenerationJob>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  /** Time to keep completed jobs before cleanup (1 hour) */
  private ttlAfterComplete = 3600000;
  /** Maximum number of concurrent jobs */
  private maxJobs = 1000;

  /**
   * Initialize the job manager with periodic cleanup.
   */
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

    logger.debug('[GenerationJobManager] Initialized with cleanup interval');
  }

  /**
   * Create a new generation job.
   * @param streamId - Unique identifier for the stream
   * @param userId - User ID who initiated the generation
   * @param conversationId - Optional conversation ID
   * @returns The created job
   */
  createJob(streamId: string, userId: string, conversationId?: string): GenerationJob {
    if (this.jobs.size >= this.maxJobs) {
      this.evictOldest();
    }

    let resolveReady: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const job: GenerationJob = {
      streamId,
      emitter: new EventEmitter(),
      status: 'running',
      createdAt: Date.now(),
      abortController: new AbortController(),
      metadata: { userId, conversationId },
      readyPromise,
      resolveReady: resolveReady!,
    };

    job.emitter.setMaxListeners(100);

    this.jobs.set(streamId, job);
    logger.debug(`[GenerationJobManager] Created job: ${streamId}`);

    return job;
  }

  /**
   * Get a job by streamId.
   * @param streamId - The stream identifier
   * @returns The job if found, undefined otherwise
   */
  getJob(streamId: string): GenerationJob | undefined {
    return this.jobs.get(streamId);
  }

  /**
   * Check if a job exists.
   * @param streamId - The stream identifier
   * @returns True if job exists
   */
  hasJob(streamId: string): boolean {
    return this.jobs.has(streamId);
  }

  /**
   * Get job status.
   * @param streamId - The stream identifier
   * @returns The job status or undefined if not found
   */
  getJobStatus(streamId: string): GenerationJobStatus | undefined {
    return this.jobs.get(streamId)?.status;
  }

  /**
   * Mark job as complete.
   * @param streamId - The stream identifier
   * @param error - Optional error message if job failed
   */
  completeJob(streamId: string, error?: string): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }

    job.status = error ? 'error' : 'complete';
    job.completedAt = Date.now();
    if (error) {
      job.error = error;
    }

    logger.debug(`[GenerationJobManager] Job completed: ${streamId}, status: ${job.status}`);
  }

  /**
   * Abort a job (user-initiated).
   * @param streamId - The stream identifier
   */
  abortJob(streamId: string): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }

    job.abortController.abort();
    job.status = 'aborted';
    job.completedAt = Date.now();
    job.emitter.emit('error', 'Request aborted by user');

    logger.debug(`[GenerationJobManager] Job aborted: ${streamId}`);
  }

  /**
   * Subscribe to a job's event stream.
   * @param streamId - The stream identifier
   * @param onChunk - Handler for chunk events
   * @param onDone - Optional handler for completion
   * @param onError - Optional handler for errors
   * @returns Unsubscribe function, or null if job not found
   */
  subscribe(
    streamId: string,
    onChunk: ChunkHandler,
    onDone?: DoneHandler,
    onError?: ErrorHandler,
  ): UnsubscribeFn | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    const chunkHandler = (event: ServerSentEvent) => onChunk(event);
    const doneHandler = (event: ServerSentEvent) => onDone?.(event);
    const errorHandler = (error: string) => onError?.(error);

    job.emitter.on('chunk', chunkHandler);
    job.emitter.on('done', doneHandler);
    job.emitter.on('error', errorHandler);

    // Signal that we're ready to receive events (first subscriber)
    if (job.emitter.listenerCount('chunk') === 1) {
      job.resolveReady();
      logger.debug(`[GenerationJobManager] First subscriber ready for ${streamId}`);
    }

    return () => {
      const currentJob = this.jobs.get(streamId);
      if (currentJob) {
        currentJob.emitter.off('chunk', chunkHandler);
        currentJob.emitter.off('done', doneHandler);
        currentJob.emitter.off('error', errorHandler);
      }
    };
  }

  /**
   * Emit a chunk event to all subscribers.
   * @param streamId - The stream identifier
   * @param event - The event data to emit
   */
  emitChunk(streamId: string, event: ServerSentEvent): void {
    const job = this.jobs.get(streamId);
    if (!job || job.status !== 'running') {
      return;
    }
    job.emitter.emit('chunk', event);
  }

  /**
   * Emit a done event to all subscribers.
   * @param streamId - The stream identifier
   * @param event - The final event data
   */
  emitDone(streamId: string, event: ServerSentEvent): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.emitter.emit('done', event);
  }

  /**
   * Emit an error event to all subscribers.
   * @param streamId - The stream identifier
   * @param error - The error message
   */
  emitError(streamId: string, error: string): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.emitter.emit('error', error);
  }

  /**
   * Cleanup completed jobs after TTL.
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [streamId, job] of this.jobs) {
      const isFinished = ['complete', 'error', 'aborted'].includes(job.status);
      if (isFinished && job.completedAt && now - job.completedAt > this.ttlAfterComplete) {
        toDelete.push(streamId);
      }
    }

    toDelete.forEach((id) => this.deleteJob(id));

    if (toDelete.length > 0) {
      logger.debug(`[GenerationJobManager] Cleaned up ${toDelete.length} expired jobs`);
    }
  }

  /**
   * Delete a job and cleanup listeners.
   * @param streamId - The stream identifier
   */
  private deleteJob(streamId: string): void {
    const job = this.jobs.get(streamId);
    if (job) {
      job.emitter.removeAllListeners();
      this.jobs.delete(streamId);
    }
  }

  /**
   * Evict oldest job (LRU).
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [streamId, job] of this.jobs) {
      if (job.createdAt < oldestTime) {
        oldestTime = job.createdAt;
        oldestId = streamId;
      }
    }

    if (oldestId) {
      logger.warn(`[GenerationJobManager] Evicting oldest job: ${oldestId}`);
      this.deleteJob(oldestId);
    }
  }

  /**
   * Get total number of active jobs.
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Get count of jobs by status.
   */
  getJobCountByStatus(): Record<GenerationJobStatus, number> {
    const counts: Record<GenerationJobStatus, number> = {
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

  /**
   * Destroy the manager and cleanup all jobs.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.jobs.forEach((_, streamId) => this.deleteJob(streamId));
    logger.debug('[GenerationJobManager] Destroyed');
  }
}

export const GenerationJobManager = new GenerationJobManagerClass();
export { GenerationJobManagerClass };
