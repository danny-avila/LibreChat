import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type {
  IContentStateManager,
  SerializableJobData,
  IEventTransport,
  AbortResult,
  IJobStore,
} from './interfaces/IJobStore';
import type * as t from '~/types';
import { InMemoryEventTransport } from './implementations/InMemoryEventTransport';
import { InMemoryContentState } from './implementations/InMemoryContentState';
import { InMemoryJobStore } from './implementations/InMemoryJobStore';

/**
 * Runtime state for active jobs - not serializable, kept in-memory per instance.
 * Contains AbortController, ready promise, and other non-serializable state.
 *
 * @property abortController - Controller to abort the generation
 * @property readyPromise - Resolves when first real subscriber connects (used to sync generation start)
 * @property resolveReady - Function to resolve readyPromise
 * @property finalEvent - Cached final event for late subscribers
 * @property syncSent - Whether sync event was sent (reset when all subscribers leave)
 * @property allSubscribersLeftHandlers - Internal handlers for disconnect events.
 *   These are stored separately from eventTransport subscribers to avoid being counted
 *   in subscriber count. This is critical: if these were registered via subscribe(),
 *   they would count as subscribers, causing isFirstSubscriber() to return false
 *   when the real client connects, which would prevent readyPromise from resolving.
 */
interface RuntimeJobState {
  abortController: AbortController;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  finalEvent?: t.ServerSentEvent;
  syncSent: boolean;
  allSubscribersLeftHandlers?: Array<(...args: unknown[]) => void>;
}

/**
 * Manages generation jobs for resumable LLM streams.
 *
 * Architecture: Composes three pluggable services via dependency injection:
 * - jobStore: Serializable job metadata (InMemory → Redis/KV for horizontal scaling)
 * - eventTransport: Pub/sub events (InMemory → Redis Pub/Sub for horizontal scaling)
 * - contentState: Volatile content refs with WeakRef (always in-memory, not shared)
 *
 * All storage methods are async to support both in-memory and external stores (Redis, etc.).
 *
 * @example Redis injection:
 * ```ts
 * const manager = new GenerationJobManagerClass({
 *   jobStore: new RedisJobStore(redisClient),
 *   eventTransport: new RedisPubSubTransport(redisClient),
 *   contentState: new InMemoryContentState(), // Always local
 * });
 * ```
 */
class GenerationJobManagerClass {
  /** Job metadata storage - swappable for Redis, KV store, etc. */
  private jobStore: IJobStore;
  /** Event pub/sub transport - swappable for Redis Pub/Sub, etc. */
  private eventTransport: IEventTransport;
  /** Volatile content state with WeakRef - always in-memory per instance */
  private contentState: IContentStateManager;

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
   *
   * This sets up:
   * 1. Serializable job data in the job store
   * 2. Runtime state including readyPromise (resolves when first SSE client connects)
   * 3. allSubscribersLeft callback for handling client disconnections
   *
   * The readyPromise mechanism ensures generation doesn't start before the client
   * is ready to receive events. The controller awaits this promise (with a short timeout)
   * before starting LLM generation.
   *
   * @param streamId - Unique identifier for this stream
   * @param userId - User who initiated the request
   * @param conversationId - Optional conversation ID for lookup
   * @returns A facade object for the GenerationJob
   */
  async createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
  ): Promise<t.GenerationJob> {
    const jobData = await this.jobStore.createJob(streamId, userId, conversationId);

    /**
     * Create runtime state with readyPromise.
     * readyPromise is resolved in subscribe() when isFirstSubscriber() returns true.
     * This synchronizes generation start with client connection.
     */
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

    /**
     * Set up all-subscribers-left callback.
     * When all SSE clients disconnect, this:
     * 1. Resets syncSent so reconnecting clients get sync event
     * 2. Calls any registered allSubscribersLeft handlers (e.g., to save partial responses)
     */
    this.eventTransport.onAllSubscribersLeft(streamId, () => {
      const currentRuntime = this.runtimeState.get(streamId);
      if (currentRuntime) {
        currentRuntime.syncSent = false;
        // Call registered handlers (from job.emitter.on('allSubscribersLeft', ...))
        const content = this.contentState.getContentParts(streamId) ?? [];
        if (currentRuntime.allSubscribersLeftHandlers) {
          for (const handler of currentRuntime.allSubscribersLeftHandlers) {
            try {
              handler(content);
            } catch (err) {
              logger.error(`[GenerationJobManager] Error in allSubscribersLeft handler:`, err);
            }
          }
        }
      }
      logger.debug(`[GenerationJobManager] All subscribers left ${streamId}, reset syncSent`);
    });

    logger.debug(`[GenerationJobManager] Created job: ${streamId}`);

    // Return facade for backwards compatibility
    return this.buildJobFacade(streamId, jobData, runtime);
  }

  /**
   * Build a GenerationJob facade from composed services.
   *
   * This facade provides a unified API (job.emitter, job.abortController, etc.)
   * while internally delegating to the injected services (jobStore, eventTransport,
   * contentState). This allows swapping implementations (e.g., Redis) without
   * changing consumer code.
   *
   * IMPORTANT: The emitterProxy.on('allSubscribersLeft') handler registration
   * does NOT use eventTransport.subscribe(). This is intentional:
   *
   * If we used subscribe() for internal handlers, those handlers would count
   * as subscribers. When the real SSE client connects, isFirstSubscriber()
   * would return false (because internal handler was "first"), and readyPromise
   * would never resolve - causing a 5-second timeout delay before generation starts.
   *
   * Instead, allSubscribersLeft handlers are stored in runtime.allSubscribersLeftHandlers
   * and called directly from the onAllSubscribersLeft callback in createJob().
   *
   * @param streamId - The stream identifier
   * @param jobData - Serializable job metadata from job store
   * @param runtime - Non-serializable runtime state (abort controller, promises, etc.)
   * @returns A GenerationJob facade object
   */
  private buildJobFacade(
    streamId: string,
    jobData: SerializableJobData,
    runtime: RuntimeJobState,
  ): t.GenerationJob {
    /**
     * Proxy emitter that delegates to eventTransport for most operations.
     * Exception: allSubscribersLeft handlers are stored separately to avoid
     * incrementing subscriber count (see class JSDoc above).
     */
    const emitterProxy = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'allSubscribersLeft') {
          // Store handler for internal callback - don't use subscribe() to avoid counting as a subscriber
          if (!runtime.allSubscribersLeftHandlers) {
            runtime.allSubscribersLeftHandlers = [];
          }
          runtime.allSubscribersLeftHandlers.push(handler);
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
  async getJob(streamId: string): Promise<t.GenerationJob | undefined> {
    const jobData = await this.jobStore.getJob(streamId);
    const runtime = this.runtimeState.get(streamId);
    if (!jobData || !runtime) {
      return undefined;
    }
    return this.buildJobFacade(streamId, jobData, runtime);
  }

  /**
   * Find an active job by conversationId.
   */
  async getJobByConversation(conversationId: string): Promise<t.GenerationJob | undefined> {
    const jobData = await this.jobStore.getJobByConversation(conversationId);
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
  async hasJob(streamId: string): Promise<boolean> {
    return this.jobStore.hasJob(streamId);
  }

  /**
   * Get job status.
   */
  async getJobStatus(streamId: string): Promise<t.GenerationJobStatus | undefined> {
    const jobData = await this.jobStore.getJob(streamId);
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
   * Returns all data needed for token spending and message saving.
   */
  async abortJob(streamId: string): Promise<AbortResult> {
    const jobData = await this.jobStore.getJob(streamId);
    const runtime = this.runtimeState.get(streamId);

    if (!jobData) {
      logger.warn(`[GenerationJobManager] Cannot abort - job not found: ${streamId}`);
      return { success: false, jobData: null, content: [], text: '', finalEvent: null };
    }

    if (runtime) {
      runtime.abortController.abort();
    }

    await this.jobStore.updateJob(streamId, {
      status: 'aborted',
      completedAt: Date.now(),
    });

    // Get content and extract text
    const content = this.contentState.getContentParts(streamId) ?? [];
    const text = this.extractTextFromContent(content);

    // Create final event for abort
    const userMessageId = jobData.userMessage?.messageId;

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
        text,
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

    return {
      success: true,
      jobData,
      content,
      text,
      finalEvent: abortFinalEvent,
    };
  }

  /**
   * Extract plain text from content parts array.
   */
  private extractTextFromContent(content: Agents.MessageContentComplex[]): string {
    return content
      .map((part) => {
        if ('text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  /**
   * Abort a job by conversationId (for abort middleware).
   * Returns abort result with all data needed for token spending and message saving.
   */
  async abortByConversation(conversationId: string): Promise<AbortResult> {
    const jobData = await this.jobStore.getJobByConversation(conversationId);
    if (!jobData) {
      logger.debug(
        `[GenerationJobManager] No active job found for conversation: ${conversationId}`,
      );
      return { success: false, jobData: null, content: [], text: '', finalEvent: null };
    }
    return this.abortJob(jobData.streamId);
  }

  /**
   * Subscribe to a job's event stream.
   *
   * This is called when an SSE client connects to /chat/stream/:streamId.
   * On first subscription, it resolves readyPromise to signal that generation can start.
   *
   * The subscriber count is critical for the readyPromise mechanism:
   * - isFirstSubscriber() returns true when subscriber count is exactly 1
   * - This happens when the first REAL client connects (not internal handlers)
   * - Internal allSubscribersLeft handlers are stored separately to avoid being counted
   *
   * @param streamId - The stream to subscribe to
   * @param onChunk - Handler for chunk events (streamed tokens, run steps, etc.)
   * @param onDone - Handler for completion event (includes final message)
   * @param onError - Handler for error events
   * @returns Subscription object with unsubscribe function, or null if job not found
   */
  async subscribe(
    streamId: string,
    onChunk: t.ChunkHandler,
    onDone?: t.DoneHandler,
    onError?: t.ErrorHandler,
  ): Promise<{ unsubscribe: t.UnsubscribeFn } | null> {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime) {
      return null;
    }

    const jobData = await this.jobStore.getJob(streamId);

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
    const isFirst = this.eventTransport.isFirstSubscriber(streamId);
    logger.debug(
      `[GenerationJobManager] subscribe check: streamId=${streamId}, isFirst=${isFirst}`,
    );
    if (isFirst) {
      runtime.resolveReady();
      logger.debug(
        `[GenerationJobManager] First subscriber ready, resolving promise for ${streamId}`,
      );
    }

    return subscription;
  }

  /**
   * Emit a chunk event to all subscribers.
   * Uses runtime state check for performance (avoids async job store lookup per token).
   */
  emitChunk(streamId: string, event: t.ServerSentEvent): void {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime || runtime.abortController.signal.aborted) {
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
    if (metadata.endpoint) {
      updates.endpoint = metadata.endpoint;
    }
    if (metadata.iconURL) {
      updates.iconURL = metadata.iconURL;
    }
    if (metadata.model) {
      updates.model = metadata.model;
    }
    if (metadata.promptTokens !== undefined) {
      updates.promptTokens = metadata.promptTokens;
    }
    this.jobStore.updateJob(streamId, updates);
    logger.debug(`[GenerationJobManager] Updated metadata for ${streamId}`);
  }

  /**
   * Set reference to the graph's contentParts array.
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    // Use runtime state check for performance (sync check)
    if (!this.runtimeState.has(streamId)) {
      return;
    }
    this.contentState.setContentParts(streamId, contentParts);
    logger.debug(`[GenerationJobManager] Set contentParts for ${streamId}`);
  }

  /**
   * Set reference to the graph instance.
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    // Use runtime state check for performance (sync check)
    if (!this.runtimeState.has(streamId)) {
      return;
    }
    this.contentState.setGraph(streamId, graph);
    logger.debug(`[GenerationJobManager] Set graph reference for ${streamId}`);
  }

  /**
   * Get resume state for reconnecting clients.
   */
  async getResumeState(streamId: string): Promise<t.ResumeState | null> {
    const jobData = await this.jobStore.getJob(streamId);
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
      if (!(await this.jobStore.hasJob(streamId))) {
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
  async getStreamInfo(streamId: string): Promise<{
    active: boolean;
    status: t.GenerationJobStatus;
    aggregatedContent?: Agents.MessageContentComplex[];
    createdAt: number;
  } | null> {
    const jobData = await this.jobStore.getJob(streamId);
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
  async getJobCount(): Promise<number> {
    return this.jobStore.getJobCount();
  }

  /**
   * Get job count by status.
   */
  async getJobCountByStatus(): Promise<Record<t.GenerationJobStatus, number>> {
    const [running, complete, error, aborted] = await Promise.all([
      this.jobStore.getJobCountByStatus('running'),
      this.jobStore.getJobCountByStatus('complete'),
      this.jobStore.getJobCountByStatus('error'),
      this.jobStore.getJobCountByStatus('aborted'),
    ]);
    return { running, complete, error, aborted };
  }

  /**
   * Destroy the manager.
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.jobStore.destroy();
    this.eventTransport.destroy();
    this.contentState.destroy();
    this.runtimeState.clear();

    logger.debug('[GenerationJobManager] Destroyed');
  }
}

export const GenerationJobManager = new GenerationJobManagerClass();
export { GenerationJobManagerClass };
