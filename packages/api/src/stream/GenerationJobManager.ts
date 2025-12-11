import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { ServerSentEvent } from '~/types';
import type {
  GenerationJob,
  GenerationJobStatus,
  ChunkHandler,
  DoneHandler,
  ErrorHandler,
  UnsubscribeFn,
  ContentPart,
  ResumeState,
  GenerationJobMetadata,
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
      runSteps: new Map(),
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
   * Emits both error event and a final done event with aborted flag.
   * @param streamId - The stream identifier
   */
  abortJob(streamId: string): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      logger.warn(`[GenerationJobManager] Cannot abort - job not found: ${streamId}`);
      return;
    }

    logger.debug(
      `[GenerationJobManager] Aborting job ${streamId}, signal already aborted: ${job.abortController.signal.aborted}`,
    );
    job.abortController.abort();
    job.status = 'aborted';
    job.completedAt = Date.now();
    logger.debug(
      `[GenerationJobManager] AbortController.abort() called for ${streamId}, signal.aborted: ${job.abortController.signal.aborted}`,
    );

    // Create a final event for abort so clients can properly handle UI cleanup
    const abortFinalEvent = {
      final: true,
      conversation: {
        conversationId: job.metadata.conversationId,
      },
      title: 'New Chat',
      requestMessage: job.metadata.userMessage
        ? {
            messageId: job.metadata.userMessage.messageId,
            conversationId: job.metadata.conversationId,
            text: job.metadata.userMessage.text ?? '',
          }
        : null,
      responseMessage: {
        messageId:
          job.metadata.responseMessageId ?? `${job.metadata.userMessage?.messageId ?? 'aborted'}_`,
        conversationId: job.metadata.conversationId,
        content: job.aggregatedContent ?? [],
        unfinished: true,
        error: true,
      },
      aborted: true,
    } as unknown as ServerSentEvent;

    job.finalEvent = abortFinalEvent;
    job.emitter.emit('done', abortFinalEvent);
    // Don't emit error event - it causes unhandled error warnings
    // The done event with error:true and aborted:true is sufficient

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
   * Also tracks run steps and user message for reconnection state.
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

    // Track run steps for reconnection
    this.trackRunStep(job, event);

    // Track user message from created event
    this.trackUserMessage(job, event);

    // Always aggregate content (for partial response saving)
    this.aggregateContent(job, event);

    job.emitter.emit('chunk', event);
  }

  /**
   * Track run step events for reconnection state.
   * This allows reconnecting clients to rebuild their stepMap.
   */
  private trackRunStep(job: GenerationJob, event: ServerSentEvent): void {
    const data = event as Record<string, unknown>;
    if (data.event !== 'on_run_step') {
      return;
    }

    const runStep = data.data as Agents.RunStep;
    if (!runStep?.id) {
      return;
    }

    job.runSteps.set(runStep.id, runStep);
    logger.debug(`[GenerationJobManager] Tracked run step: ${runStep.id} for ${job.streamId}`);
  }

  /**
   * Track user message from created event for reconnection.
   */
  private trackUserMessage(job: GenerationJob, event: ServerSentEvent): void {
    const data = event as Record<string, unknown>;
    if (!data.created || !data.message) {
      return;
    }

    const message = data.message as Record<string, unknown>;
    job.metadata.userMessage = {
      messageId: message.messageId as string,
      parentMessageId: message.parentMessageId as string | undefined,
      conversationId: message.conversationId as string | undefined,
      text: message.text as string | undefined,
    };

    // Update conversationId in metadata if not set
    if (!job.metadata.conversationId && message.conversationId) {
      job.metadata.conversationId = message.conversationId as string;
    }

    logger.debug(`[GenerationJobManager] Tracked user message for ${job.streamId}`);
  }

  /**
   * Update job metadata with additional information.
   * Called when more information becomes available during generation.
   * @param streamId - The stream identifier
   * @param metadata - Partial metadata to merge
   */
  updateMetadata(streamId: string, metadata: Partial<GenerationJobMetadata>): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.metadata = { ...job.metadata, ...metadata };
    logger.debug(`[GenerationJobManager] Updated metadata for ${streamId}`);
  }

  /**
   * Get resume state for reconnecting clients.
   * Includes run steps, aggregated content, and user message data.
   * @param streamId - The stream identifier
   * @returns Resume state or null if job not found
   */
  getResumeState(streamId: string): ResumeState | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    return {
      runSteps: Array.from(job.runSteps.values()),
      aggregatedContent: job.aggregatedContent,
      userMessage: job.metadata.userMessage,
      responseMessageId: job.metadata.responseMessageId,
      conversationId: job.metadata.conversationId,
    };
  }

  /**
   * Mark that sync has been sent for this job to prevent duplicate replays.
   * @param streamId - The stream identifier
   */
  markSyncSent(streamId: string): void {
    const job = this.jobs.get(streamId);
    if (job) {
      job.syncSent = true;
    }
  }

  /**
   * Check if sync has been sent for this job.
   * @param streamId - The stream identifier
   */
  wasSyncSent(streamId: string): boolean {
    return this.jobs.get(streamId)?.syncSent ?? false;
  }

  /**
   * Aggregate content parts from message delta events.
   * Used to save partial response when subscribers disconnect.
   * Uses flat format: { type: 'text', text: 'content' }
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
            // Find or create text content part in flat format
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
      job.runSteps.clear();
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
   * Returns chunk count, status, aggregated content, and run step count.
   */
  getStreamInfo(streamId: string): {
    active: boolean;
    status: GenerationJobStatus;
    chunkCount: number;
    runStepCount: number;
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
      runStepCount: job.runSteps.size,
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
