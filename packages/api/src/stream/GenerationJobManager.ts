import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type { SerializableJobData } from './interfaces/IJobStore';
import type * as t from '~/types';
import { InMemoryEventTransport } from './implementations/InMemoryEventTransport';
import { InMemoryContentState } from './implementations/InMemoryContentState';
import { InMemoryJobStore } from './implementations/InMemoryJobStore';

/**
 * Runtime state for active jobs - not serializable, kept in-memory per instance.
 * Contains AbortController, ready promise, and other non-serializable state.
 */
interface RuntimeJobState {
  abortController: AbortController;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  finalEvent?: t.ServerSentEvent;
  syncSent: boolean;
}

/**
 * Manages generation jobs for resumable LLM streams.
 * Composes three implementations for clean separation of concerns:
 * - InMemoryJobStore: Serializable job metadata (swappable for Redis)
 * - InMemoryEventTransport: Pub/sub events (swappable for Redis Pub/Sub)
 * - InMemoryContentState: Volatile content refs with WeakRef (always in-memory)
 */
class GenerationJobManagerClass {
  private jobStore: InMemoryJobStore;
  private eventTransport: InMemoryEventTransport;
  private contentState: InMemoryContentState;

  /** Runtime state - always in-memory, not serializable */
  private runtimeState = new Map<string, RuntimeJobState>();

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.jobStore = new InMemoryJobStore({ ttlAfterComplete: 300000, maxJobs: 1000 });
    this.eventTransport = new InMemoryEventTransport();
    this.contentState = new InMemoryContentState();
  }

  /**
   * Initialize the job manager with periodic cleanup.
   */
  initialize(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.jobStore.initialize();

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.debug('[GenerationJobManager] Initialized');
  }

  /**
   * Create a new generation job.
   * @returns A facade object compatible with the old GenerationJob interface
   */
  createJob(streamId: string, userId: string, conversationId?: string): t.GenerationJob {
    // Create serializable job data (sync for in-memory)
    const jobData = this.jobStore.createJobSync(streamId, userId, conversationId);

    // Create runtime state
    let resolveReady: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const runtime: RuntimeJobState = {
      abortController: new AbortController(),
      readyPromise,
      resolveReady: resolveReady!,
      syncSent: false,
    };
    this.runtimeState.set(streamId, runtime);

    // Set up all-subscribers-left callback
    this.eventTransport.onAllSubscribersLeft(streamId, () => {
      const currentRuntime = this.runtimeState.get(streamId);
      if (currentRuntime) {
        currentRuntime.syncSent = false;
      }
      const content = this.contentState.getContentParts(streamId) ?? [];
      this.eventTransport.emitChunk(streamId, {
        _internal: 'allSubscribersLeft',
        content,
      });
      logger.debug(`[GenerationJobManager] All subscribers left ${streamId}, reset syncSent`);
    });

    logger.debug(`[GenerationJobManager] Created job: ${streamId}`);

    // Return facade for backwards compatibility
    return this.buildJobFacade(streamId, jobData, runtime);
  }

  /**
   * Build a GenerationJob facade from job data and runtime state.
   * This maintains backwards compatibility with existing code.
   */
  private buildJobFacade(
    streamId: string,
    jobData: SerializableJobData,
    runtime: RuntimeJobState,
  ): t.GenerationJob {
    // Create a proxy emitter that delegates to eventTransport
    const emitterProxy = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'allSubscribersLeft') {
          // Subscribe to internal event
          this.eventTransport.subscribe(streamId, {
            onChunk: (e) => {
              const evt = e as Record<string, unknown>;
              if (evt._internal === 'allSubscribersLeft') {
                handler(evt.content);
              }
            },
          });
        }
      },
      emit: () => {
        /* handled via eventTransport */
      },
      listenerCount: () => this.eventTransport.getSubscriberCount(streamId),
      setMaxListeners: () => {
        /* no-op for proxy */
      },
      removeAllListeners: () => this.eventTransport.cleanup(streamId),
      off: () => {
        /* handled via unsubscribe */
      },
    };

    return {
      streamId,
      emitter: emitterProxy as unknown as t.GenerationJob['emitter'],
      status: jobData.status as t.GenerationJobStatus,
      createdAt: jobData.createdAt,
      completedAt: jobData.completedAt,
      abortController: runtime.abortController,
      error: jobData.error,
      metadata: {
        userId: jobData.userId,
        conversationId: jobData.conversationId,
        userMessage: jobData.userMessage,
        responseMessageId: jobData.responseMessageId,
        sender: jobData.sender,
      },
      readyPromise: runtime.readyPromise,
      resolveReady: runtime.resolveReady,
      finalEvent: runtime.finalEvent,
      syncSent: runtime.syncSent,
    };
  }

  /**
   * Get a job by streamId.
   */
  getJob(streamId: string): t.GenerationJob | undefined {
    const jobData = this.jobStore.getJobSync(streamId);
    const runtime = this.runtimeState.get(streamId);
    if (!jobData || !runtime) {
      return undefined;
    }
    return this.buildJobFacade(streamId, jobData, runtime);
  }

  /**
   * Find an active job by conversationId.
   */
  getJobByConversation(conversationId: string): t.GenerationJob | undefined {
    const jobData = this.jobStore.getJobByConversationSync(conversationId);
    if (!jobData) {
      return undefined;
    }
    const runtime = this.runtimeState.get(jobData.streamId);
    if (!runtime) {
      return undefined;
    }
    return this.buildJobFacade(jobData.streamId, jobData, runtime);
  }

  /**
   * Check if a job exists.
   */
  hasJob(streamId: string): boolean {
    return this.jobStore.hasJobSync(streamId);
  }

  /**
   * Get job status.
   */
  getJobStatus(streamId: string): t.GenerationJobStatus | undefined {
    const jobData = this.jobStore.getJobSync(streamId);
    return jobData?.status as t.GenerationJobStatus | undefined;
  }

  /**
   * Mark job as complete.
   */
  async completeJob(streamId: string, error?: string): Promise<void> {
    await this.jobStore.updateJob(streamId, {
      status: error ? 'error' : 'complete',
      completedAt: Date.now(),
      error,
    });

    // Clear content state
    this.contentState.clearContentState(streamId);

    logger.debug(`[GenerationJobManager] Job completed: ${streamId}`);
  }

  /**
   * Abort a job (user-initiated).
   */
  async abortJob(streamId: string): Promise<void> {
    const jobData = this.jobStore.getJobSync(streamId);
    const runtime = this.runtimeState.get(streamId);

    if (!jobData) {
      logger.warn(`[GenerationJobManager] Cannot abort - job not found: ${streamId}`);
      return;
    }

    if (runtime) {
      runtime.abortController.abort();
    }

    await this.jobStore.updateJob(streamId, {
      status: 'aborted',
      completedAt: Date.now(),
    });

    // Create final event for abort
    const userMessageId = jobData.userMessage?.messageId;
    const content = this.contentState.getContentParts(streamId) ?? [];

    const abortFinalEvent: t.ServerSentEvent = {
      final: true,
      conversation: { conversationId: jobData.conversationId },
      title: 'New Chat',
      requestMessage: jobData.userMessage
        ? {
            messageId: userMessageId,
            parentMessageId: jobData.userMessage.parentMessageId,
            conversationId: jobData.conversationId,
            text: jobData.userMessage.text ?? '',
            isCreatedByUser: true,
          }
        : null,
      responseMessage: {
        messageId: jobData.responseMessageId ?? `${userMessageId ?? 'aborted'}_`,
        parentMessageId: userMessageId,
        conversationId: jobData.conversationId,
        content,
        sender: jobData.sender ?? 'AI',
        unfinished: true,
        error: false,
        isCreatedByUser: false,
      },
      aborted: true,
    } as unknown as t.ServerSentEvent;

    if (runtime) {
      runtime.finalEvent = abortFinalEvent;
    }

    this.eventTransport.emitDone(streamId, abortFinalEvent);
    this.contentState.clearContentState(streamId);

    logger.debug(`[GenerationJobManager] Job aborted: ${streamId}`);
  }

  /**
   * Subscribe to a job's event stream.
   */
  subscribe(
    streamId: string,
    onChunk: t.ChunkHandler,
    onDone?: t.DoneHandler,
    onError?: t.ErrorHandler,
  ): { unsubscribe: t.UnsubscribeFn } | null {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime) {
      return null;
    }

    const jobData = this.jobStore.getJobSync(streamId);

    // If job already complete, send final event
    setImmediate(() => {
      if (
        runtime.finalEvent &&
        jobData &&
        ['complete', 'error', 'aborted'].includes(jobData.status)
      ) {
        onDone?.(runtime.finalEvent);
      }
    });

    const subscription = this.eventTransport.subscribe(streamId, {
      onChunk: (event) => {
        const e = event as t.ServerSentEvent;
        // Filter out internal events
        if (!(e as Record<string, unknown>)._internal) {
          onChunk(e);
        }
      },
      onDone: (event) => onDone?.(event as t.ServerSentEvent),
      onError,
    });

    // Signal ready on first subscriber
    if (this.eventTransport.isFirstSubscriber(streamId)) {
      runtime.resolveReady();
      logger.debug(`[GenerationJobManager] First subscriber ready for ${streamId}`);
    }

    return subscription;
  }

  /**
   * Emit a chunk event to all subscribers.
   */
  emitChunk(streamId: string, event: t.ServerSentEvent): void {
    const jobData = this.jobStore.getJobSync(streamId);
    if (!jobData || jobData.status !== 'running') {
      return;
    }

    // Track user message from created event
    this.trackUserMessage(streamId, event);

    this.eventTransport.emitChunk(streamId, event);
  }

  /**
   * Track user message from created event.
   */
  private trackUserMessage(streamId: string, event: t.ServerSentEvent): void {
    const data = event as Record<string, unknown>;
    if (!data.created || !data.message) {
      return;
    }

    const message = data.message as Record<string, unknown>;
    const updates: Partial<SerializableJobData> = {
      userMessage: {
        messageId: message.messageId as string,
        parentMessageId: message.parentMessageId as string | undefined,
        conversationId: message.conversationId as string | undefined,
        text: message.text as string | undefined,
      },
    };

    if (message.conversationId) {
      updates.conversationId = message.conversationId as string;
    }

    this.jobStore.updateJob(streamId, updates);
    logger.debug(`[GenerationJobManager] Tracked user message for ${streamId}`);
  }

  /**
   * Update job metadata.
   */
  updateMetadata(streamId: string, metadata: Partial<t.GenerationJobMetadata>): void {
    const updates: Partial<SerializableJobData> = {};
    if (metadata.responseMessageId) {
      updates.responseMessageId = metadata.responseMessageId;
    }
    if (metadata.sender) {
      updates.sender = metadata.sender;
    }
    if (metadata.conversationId) {
      updates.conversationId = metadata.conversationId;
    }
    if (metadata.userMessage) {
      updates.userMessage = metadata.userMessage;
    }
    this.jobStore.updateJob(streamId, updates);
    logger.debug(`[GenerationJobManager] Updated metadata for ${streamId}`);
  }

  /**
   * Set reference to the graph's contentParts array.
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    if (!this.jobStore.hasJobSync(streamId)) {
      return;
    }
    this.contentState.setContentParts(streamId, contentParts);
    logger.debug(`[GenerationJobManager] Set contentParts for ${streamId}`);
  }

  /**
   * Set reference to the graph instance.
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    if (!this.jobStore.hasJobSync(streamId)) {
      return;
    }
    this.contentState.setGraph(streamId, graph);
    logger.debug(`[GenerationJobManager] Set graph reference for ${streamId}`);
  }

  /**
   * Get resume state for reconnecting clients.
   */
  getResumeState(streamId: string): t.ResumeState | null {
    const jobData = this.jobStore.getJobSync(streamId);
    if (!jobData) {
      return null;
    }

    const aggregatedContent = this.contentState.getContentParts(streamId) ?? [];
    const runSteps = this.contentState.getRunSteps(streamId);

    logger.debug(`[GenerationJobManager] getResumeState:`, {
      streamId,
      aggregatedContentLength: aggregatedContent.length,
      runStepsLength: runSteps.length,
    });

    return {
      runSteps,
      aggregatedContent,
      userMessage: jobData.userMessage,
      responseMessageId: jobData.responseMessageId,
      conversationId: jobData.conversationId,
      sender: jobData.sender,
    };
  }

  /**
   * Mark that sync has been sent.
   */
  markSyncSent(streamId: string): void {
    const runtime = this.runtimeState.get(streamId);
    if (runtime) {
      runtime.syncSent = true;
    }
  }

  /**
   * Check if sync has been sent.
   */
  wasSyncSent(streamId: string): boolean {
    return this.runtimeState.get(streamId)?.syncSent ?? false;
  }

  /**
   * Emit a done event.
   */
  emitDone(streamId: string, event: t.ServerSentEvent): void {
    const runtime = this.runtimeState.get(streamId);
    if (runtime) {
      runtime.finalEvent = event;
    }
    this.eventTransport.emitDone(streamId, event);
  }

  /**
   * Emit an error event.
   */
  emitError(streamId: string, error: string): void {
    this.eventTransport.emitError(streamId, error);
  }

  /**
   * Cleanup expired jobs.
   */
  private async cleanup(): Promise<void> {
    const count = await this.jobStore.cleanup();

    // Cleanup runtime state for deleted jobs
    for (const streamId of this.runtimeState.keys()) {
      if (!this.jobStore.hasJobSync(streamId)) {
        this.runtimeState.delete(streamId);
        this.contentState.clearContentState(streamId);
        this.eventTransport.cleanup(streamId);
      }
    }

    if (count > 0) {
      logger.debug(`[GenerationJobManager] Cleaned up ${count} expired jobs`);
    }
  }

  /**
   * Get stream info for status endpoint.
   */
  getStreamInfo(streamId: string): {
    active: boolean;
    status: t.GenerationJobStatus;
    aggregatedContent?: Agents.MessageContentComplex[];
    createdAt: number;
  } | null {
    const jobData = this.jobStore.getJobSync(streamId);
    if (!jobData) {
      return null;
    }

    return {
      active: jobData.status === 'running',
      status: jobData.status as t.GenerationJobStatus,
      aggregatedContent: this.contentState.getContentParts(streamId) ?? [],
      createdAt: jobData.createdAt,
    };
  }

  /**
   * Get total job count.
   */
  getJobCount(): number {
    return this.jobStore.getJobCount();
  }

  /**
   * Get job count by status.
   */
  getJobCountByStatus(): Record<t.GenerationJobStatus, number> {
    return this.jobStore.getJobCountByStatus() as Record<t.GenerationJobStatus, number>;
  }

  /**
   * Destroy the manager.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.jobStore.destroy();
    this.eventTransport.destroy();
    this.contentState.destroy();
    this.runtimeState.clear();

    logger.debug('[GenerationJobManager] Destroyed');
  }
}

export const GenerationJobManager = new GenerationJobManagerClass();
export { GenerationJobManagerClass };
