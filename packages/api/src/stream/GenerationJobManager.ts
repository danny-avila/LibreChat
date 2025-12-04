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
  ContentPart,
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
      chunks: [],
      aggregatedContent: [],
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
   * Find an active job by conversationId.
   * Since streamId === conversationId for existing conversations,
   * we first check by streamId, then search metadata.
   * @param conversationId - The conversation identifier
   * @returns The job if found, undefined otherwise
   */
  getJobByConversation(conversationId: string): GenerationJob | undefined {
    const directMatch = this.jobs.get(conversationId);
    if (directMatch && directMatch.status === 'running') {
      return directMatch;
    }

    for (const job of this.jobs.values()) {
      if (job.metadata.conversationId === conversationId && job.status === 'running') {
        return job;
      }
    }

    return undefined;
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
   * Subscribe to a job's event stream with replay support.
   * Replays any chunks buffered during disconnect, then continues with live events.
   * Buffer is cleared after replay (only holds chunks missed during disconnect).
   * @param streamId - The stream identifier
   * @param onChunk - Handler for chunk events
   * @param onDone - Optional handler for completion
   * @param onError - Optional handler for errors
   * @returns Object with unsubscribe function, or null if job not found
   */
  subscribe(
    streamId: string,
    onChunk: ChunkHandler,
    onDone?: DoneHandler,
    onError?: ErrorHandler,
  ): { unsubscribe: UnsubscribeFn } | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    // Replay buffered chunks (only chunks missed during disconnect)
    const chunksToReplay = [...job.chunks];
    const replayCount = chunksToReplay.length;

    if (replayCount > 0) {
      logger.debug(
        `[GenerationJobManager] Replaying ${replayCount} buffered chunks for ${streamId}`,
      );
    }

    // Clear buffer after capturing for replay - subscriber is now connected
    job.chunks = [];

    // Use setImmediate to allow the caller to set up their connection first
    setImmediate(() => {
      for (const chunk of chunksToReplay) {
        onChunk(chunk);
      }

      // If job is already complete, send the final event
      if (job.finalEvent && ['complete', 'error', 'aborted'].includes(job.status)) {
        onDone?.(job.finalEvent);
      }
    });

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

    const unsubscribe = () => {
      const currentJob = this.jobs.get(streamId);
      if (currentJob) {
        currentJob.emitter.off('chunk', chunkHandler);
        currentJob.emitter.off('done', doneHandler);
        currentJob.emitter.off('error', errorHandler);

        // Emit event when last subscriber leaves (for saving partial response)
        if (currentJob.emitter.listenerCount('chunk') === 0 && currentJob.status === 'running') {
          currentJob.emitter.emit('allSubscribersLeft', currentJob.aggregatedContent);
          logger.debug(`[GenerationJobManager] All subscribers left ${streamId}`);
        }
      }
    };

    return { unsubscribe };
  }

  /**
   * Emit a chunk event to all subscribers.
   * Only buffers chunks when no subscribers are listening (for reconnect replay).
   * @param streamId - The stream identifier
   * @param event - The event data to emit
   */
  emitChunk(streamId: string, event: ServerSentEvent): void {
    const job = this.jobs.get(streamId);
    if (!job || job.status !== 'running') {
      return;
    }

    // Only buffer if no one is listening (for reconnect replay)
    const hasSubscribers = job.emitter.listenerCount('chunk') > 0;
    if (!hasSubscribers) {
      job.chunks.push(event);
    }

    // Always aggregate content (for partial response saving)
    this.aggregateContent(job, event);

    job.emitter.emit('chunk', event);
  }

  /**
   * Aggregate content parts from message delta events.
   * Used to save partial response when subscribers disconnect.
   */
  private aggregateContent(job: GenerationJob, event: ServerSentEvent): void {
    // Check for on_message_delta events which contain content
    const data = event as Record<string, unknown>;
    if (data.event === 'on_message_delta' && data.data) {
      const eventData = data.data as Record<string, unknown>;
      const delta = eventData.delta as Record<string, unknown> | undefined;
      if (delta?.content && Array.isArray(delta.content)) {
        for (const part of delta.content) {
          if (part.type === 'text' && part.text) {
            // Find or create text content part
            let textPart = job.aggregatedContent?.find((p) => p.type === 'text');
            if (!textPart) {
              textPart = { type: 'text', text: '' };
              job.aggregatedContent = job.aggregatedContent || [];
              job.aggregatedContent.push(textPart);
            }
            textPart.text = (textPart.text || '') + part.text;
          }
        }
      }
    }
  }

  /**
   * Emit a done event to all subscribers.
   * Stores the final event for replay on reconnect.
   * @param streamId - The stream identifier
   * @param event - The final event data
   */
  emitDone(streamId: string, event: ServerSentEvent): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.finalEvent = event;
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
   * Get stream info for status endpoint.
   * Returns chunk count, status, and aggregated content.
   */
  getStreamInfo(streamId: string): {
    active: boolean;
    status: GenerationJobStatus;
    chunkCount: number;
    aggregatedContent?: ContentPart[];
    createdAt: number;
  } | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    return {
      active: job.status === 'running',
      status: job.status,
      chunkCount: job.chunks.length,
      aggregatedContent: job.aggregatedContent,
      createdAt: job.createdAt,
    };
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
