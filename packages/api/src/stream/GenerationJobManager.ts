import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type * as t from '~/types';

/**
 * Manages generation jobs for resumable LLM streams.
 * Generation runs independently of HTTP connections via EventEmitter.
 * Clients can subscribe/unsubscribe to job events without affecting generation.
 */
class GenerationJobManagerClass {
  private jobs = new Map<string, t.GenerationJob>();
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
  createJob(streamId: string, userId: string, conversationId?: string): t.GenerationJob {
    if (this.jobs.size >= this.maxJobs) {
      this.evictOldest();
    }

    let resolveReady: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const job: t.GenerationJob = {
      streamId,
      emitter: new EventEmitter(),
      status: 'running',
      createdAt: Date.now(),
      abortController: new AbortController(),
      metadata: { userId, conversationId },
      readyPromise,
      resolveReady: resolveReady!,
      chunks: [],
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
  getJob(streamId: string): t.GenerationJob | undefined {
    return this.jobs.get(streamId);
  }

  /**
   * Find an active job by conversationId.
   * Since streamId === conversationId for existing conversations,
   * we first check by streamId, then search metadata.
   * @param conversationId - The conversation identifier
   * @returns The job if found, undefined otherwise
   */
  getJobByConversation(conversationId: string): t.GenerationJob | undefined {
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
  getJobStatus(streamId: string): t.GenerationJobStatus | undefined {
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
    const userMessageId = job.metadata.userMessage?.messageId;
    const abortFinalEvent = {
      final: true,
      conversation: {
        conversationId: job.metadata.conversationId,
      },
      title: 'New Chat',
      requestMessage: job.metadata.userMessage
        ? {
            messageId: userMessageId,
            parentMessageId: job.metadata.userMessage.parentMessageId,
            conversationId: job.metadata.conversationId,
            text: job.metadata.userMessage.text ?? '',
            isCreatedByUser: true,
          }
        : null,
      responseMessage: {
        messageId: job.metadata.responseMessageId ?? `${userMessageId ?? 'aborted'}_`,
        parentMessageId: userMessageId, // Link response to user message
        conversationId: job.metadata.conversationId,
        content: job.contentPartsRef ?? [],
        sender: job.metadata.sender ?? 'AI',
        unfinished: true,
        /** Not an error - the job was intentionally aborted */
        error: false,
        isCreatedByUser: false,
      },
      aborted: true,
    } as unknown as t.ServerSentEvent;

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
    onChunk: t.ChunkHandler,
    onDone?: t.DoneHandler,
    onError?: t.ErrorHandler,
  ): { unsubscribe: t.UnsubscribeFn } | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    // Use setImmediate to allow the caller to set up their connection first
    setImmediate(() => {
      // If job is already complete, send the final event
      if (job.finalEvent && ['complete', 'error', 'aborted'].includes(job.status)) {
        onDone?.(job.finalEvent);
      }
    });

    const chunkHandler = (event: t.ServerSentEvent) => onChunk(event);
    const doneHandler = (event: t.ServerSentEvent) => onDone?.(event);
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

        // When last subscriber leaves
        if (currentJob.emitter.listenerCount('chunk') === 0 && currentJob.status === 'running') {
          // Reset syncSent so reconnecting clients get sync event again
          currentJob.syncSent = false;
          // Emit event for saving partial response - use graph's contentParts directly
          currentJob.emitter.emit('allSubscribersLeft', currentJob.contentPartsRef ?? []);
          logger.debug(`[GenerationJobManager] All subscribers left ${streamId}, reset syncSent`);
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
  emitChunk(streamId: string, event: t.ServerSentEvent): void {
    const job = this.jobs.get(streamId);
    if (!job || job.status !== 'running') {
      return;
    }

    // // Only buffer if no one is listening (for reconnect replay)
    // const hasSubscribers = job.emitter.listenerCount('chunk') > 0;
    // if (!hasSubscribers) {
    //   job.chunks.push(event);
    // }

    // Track user message from created event
    this.trackUserMessage(job, event);

    // Run steps and content are tracked via graphRef and contentPartsRef
    // No need to aggregate separately - these reference the graph's data directly

    job.emitter.emit('chunk', event);
  }

  /**
   * Track user message from created event for reconnection.
   */
  private trackUserMessage(job: t.GenerationJob, event: t.ServerSentEvent): void {
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
  updateMetadata(streamId: string, metadata: Partial<t.GenerationJobMetadata>): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.metadata = { ...job.metadata, ...metadata };
    logger.debug(`[GenerationJobManager] Updated metadata for ${streamId}`);
  }

  /**
   * Set reference to the graph's contentParts array.
   * This is the authoritative content source - no need to aggregate separately.
   * @param streamId - The stream identifier
   * @param contentParts - Reference to graph's contentParts array
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.contentPartsRef = contentParts;
    logger.debug(`[GenerationJobManager] Set contentParts reference for ${streamId}`, {
      initialLength: contentParts?.length ?? 0,
      isArray: Array.isArray(contentParts),
    });
  }

  /**
   * Set reference to the graph instance.
   * This provides access to run steps (contentData) - no need to track separately.
   * @param streamId - The stream identifier
   * @param graph - Reference to the graph instance (must have contentData property)
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.graphRef = graph;
    logger.debug(`[GenerationJobManager] Set graph reference for ${streamId}`);
  }

  /**
   * Get resume state for reconnecting clients.
   * Includes run steps, aggregated content, and user message data.
   * @param streamId - The stream identifier
   * @returns Resume state or null if job not found
   */
  getResumeState(streamId: string): t.ResumeState | null {
    const job = this.jobs.get(streamId);
    if (!job) {
      return null;
    }

    // Use graph's contentParts directly - it's always current and complete
    // No conversion needed - send as-is
    const aggregatedContent = job.contentPartsRef ?? [];

    // Use graph's contentData for run steps - it's the authoritative source
    const runSteps = job.graphRef?.contentData ?? [];

    logger.debug(`[GenerationJobManager] getResumeState:`, {
      streamId,
      aggregatedContentLength: aggregatedContent.length,
      runStepsLength: runSteps.length,
      hasGraphRef: !!job.graphRef,
      hasContentPartsRef: !!job.contentPartsRef,
    });

    return {
      runSteps,
      aggregatedContent,
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
   * Emit a done event to all subscribers.
   * Stores the final event for replay on reconnect.
   * @param streamId - The stream identifier
   * @param event - The final event data
   */
  emitDone(streamId: string, event: t.ServerSentEvent): void {
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
   * Returns chunk count, status, aggregated content, and run step count.
   */
  getStreamInfo(streamId: string): {
    active: boolean;
    status: t.GenerationJobStatus;
    chunkCount: number;
    runStepCount: number;
    aggregatedContent?: Agents.MessageContentComplex[];
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
      runStepCount: job.graphRef?.contentData?.length ?? 0,
      aggregatedContent: job.contentPartsRef ?? [],
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
  getJobCountByStatus(): Record<t.GenerationJobStatus, number> {
    const counts: Record<t.GenerationJobStatus, number> = {
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
