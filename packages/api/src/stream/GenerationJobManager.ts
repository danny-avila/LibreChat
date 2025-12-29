import { logger } from '@librechat/data-schemas';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type {
  SerializableJobData,
  IEventTransport,
  AbortResult,
  IJobStore,
} from './interfaces/IJobStore';
import type * as t from '~/types';
import { InMemoryEventTransport } from './implementations/InMemoryEventTransport';
import { InMemoryJobStore } from './implementations/InMemoryJobStore';

/**
 * Configuration options for GenerationJobManager
 */
export interface GenerationJobManagerOptions {
  jobStore?: IJobStore;
  eventTransport?: IEventTransport;
  /**
   * If true, cleans up event transport immediately when job completes.
   * If false, keeps EventEmitters until periodic cleanup for late reconnections.
   * Default: true (immediate cleanup to save memory)
   */
  cleanupOnComplete?: boolean;
}

/**
 * Runtime state for active jobs - not serializable, kept in-memory per instance.
 * Contains AbortController, ready promise, and other non-serializable state.
 *
 * @property abortController - Controller to abort the generation
 * @property readyPromise - Resolves immediately (legacy, kept for API compatibility)
 * @property resolveReady - Function to resolve readyPromise
 * @property finalEvent - Cached final event for late subscribers
 * @property syncSent - Whether sync event was sent (reset when all subscribers leave)
 * @property earlyEventBuffer - Buffer for events emitted before first subscriber connects
 * @property hasSubscriber - Whether at least one subscriber has connected
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
  earlyEventBuffer: t.ServerSentEvent[];
  hasSubscriber: boolean;
  allSubscribersLeftHandlers?: Array<(...args: unknown[]) => void>;
}

/**
 * Manages generation jobs for resumable LLM streams.
 *
 * Architecture: Composes two pluggable services via dependency injection:
 * - jobStore: Job metadata + content state (InMemory → Redis for horizontal scaling)
 * - eventTransport: Pub/sub events (InMemory → Redis Pub/Sub for horizontal scaling)
 *
 * Content state is tied to jobs:
 * - In-memory: jobStore holds WeakRef to graph for live content/run steps access
 * - Redis: jobStore persists chunks, reconstructs content on demand
 *
 * All storage methods are async to support both in-memory and external stores (Redis, etc.).
 *
 * @example Redis injection:
 * ```ts
 * const manager = new GenerationJobManagerClass({
 *   jobStore: new RedisJobStore(redisClient),
 *   eventTransport: new RedisPubSubTransport(redisClient),
 * });
 * ```
 */
class GenerationJobManagerClass {
  /** Job metadata + content state storage - swappable for Redis, etc. */
  private jobStore: IJobStore;
  /** Event pub/sub transport - swappable for Redis Pub/Sub, etc. */
  private eventTransport: IEventTransport;

  /** Runtime state - always in-memory, not serializable */
  private runtimeState = new Map<string, RuntimeJobState>();

  private cleanupInterval: NodeJS.Timeout | null = null;

  /** Whether we're using Redis stores */
  private _isRedis = false;

  /** Whether to cleanup event transport immediately on job completion */
  private _cleanupOnComplete = true;

  constructor(options?: GenerationJobManagerOptions) {
    this.jobStore =
      options?.jobStore ?? new InMemoryJobStore({ ttlAfterComplete: 0, maxJobs: 1000 });
    this.eventTransport = options?.eventTransport ?? new InMemoryEventTransport();
    this._cleanupOnComplete = options?.cleanupOnComplete ?? true;
  }

  /**
   * Initialize the job manager with periodic cleanup.
   * Call this once at application startup.
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
   * Configure the manager with custom stores.
   * Call this BEFORE initialize() to use Redis or other stores.
   *
   * @example Using Redis
   * ```ts
   * import { createStreamServicesFromCache } from '~/stream/createStreamServices';
   * import { cacheConfig, ioredisClient } from '~/cache';
   *
   * const services = createStreamServicesFromCache({ cacheConfig, ioredisClient });
   * GenerationJobManager.configure(services);
   * GenerationJobManager.initialize();
   * ```
   */
  configure(services: {
    jobStore: IJobStore;
    eventTransport: IEventTransport;
    isRedis?: boolean;
    cleanupOnComplete?: boolean;
  }): void {
    if (this.cleanupInterval) {
      logger.warn(
        '[GenerationJobManager] Reconfiguring after initialization - destroying existing services',
      );
      this.destroy();
    }

    this.jobStore = services.jobStore;
    this.eventTransport = services.eventTransport;
    this._isRedis = services.isRedis ?? false;
    this._cleanupOnComplete = services.cleanupOnComplete ?? true;

    logger.info(
      `[GenerationJobManager] Configured with ${this._isRedis ? 'Redis' : 'in-memory'} stores`,
    );
  }

  /**
   * Check if using Redis stores.
   */
  get isRedis(): boolean {
    return this._isRedis;
  }

  /**
   * Get the job store instance (for advanced use cases).
   */
  getJobStore(): IJobStore {
    return this.jobStore;
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
     *
     * With the resumable stream architecture, we no longer need to wait for the
     * first subscriber before starting generation:
     * - Redis mode: Events are persisted and can be replayed via sync
     * - In-memory mode: Content is aggregated and sent via sync on connect
     *
     * We resolve readyPromise immediately to eliminate startup latency.
     * The sync mechanism handles late-connecting clients.
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
      earlyEventBuffer: [],
      hasSubscriber: false,
    };
    this.runtimeState.set(streamId, runtime);

    // Resolve immediately - early event buffer handles late subscribers
    resolveReady!();

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
        if (currentRuntime.allSubscribersLeftHandlers) {
          this.jobStore
            .getContentParts(streamId)
            .then((result) => {
              const parts = result?.content ?? [];
              for (const handler of currentRuntime.allSubscribersLeftHandlers ?? []) {
                try {
                  handler(parts);
                } catch (err) {
                  logger.error(`[GenerationJobManager] Error in allSubscribersLeft handler:`, err);
                }
              }
            })
            .catch((err) => {
              logger.error(
                `[GenerationJobManager] Failed to get content parts for allSubscribersLeft handlers:`,
                err,
              );
            });
        }
      }
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
   * If cleanupOnComplete is true (default), immediately cleans up job resources.
   * Note: eventTransport is NOT cleaned up here to allow the final event to be
   * fully transmitted. It will be cleaned up when subscribers disconnect or
   * by the periodic cleanup job.
   */
  async completeJob(streamId: string, error?: string): Promise<void> {
    const runtime = this.runtimeState.get(streamId);

    // Abort the controller to signal all pending operations (e.g., OAuth flow monitors)
    // that the job is done and they should clean up
    if (runtime) {
      runtime.abortController.abort();
    }

    // Clear content state and run step buffer (Redis only)
    this.jobStore.clearContentState(streamId);
    this.runStepBuffers?.delete(streamId);

    // Immediate cleanup if configured (default: true)
    if (this._cleanupOnComplete) {
      this.runtimeState.delete(streamId);
      // Don't cleanup eventTransport here - let the done event fully transmit first.
      // EventTransport will be cleaned up when subscribers disconnect or by periodic cleanup.
      await this.jobStore.deleteJob(streamId);
    } else {
      // Only update status if keeping the job around
      await this.jobStore.updateJob(streamId, {
        status: error ? 'error' : 'complete',
        completedAt: Date.now(),
        error,
      });
    }

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
      return { success: false, jobData: null, content: [], finalEvent: null };
    }

    if (runtime) {
      runtime.abortController.abort();
    }

    // Get content before clearing state
    const result = await this.jobStore.getContentParts(streamId);
    const content = result?.content ?? [];

    // Detect "early abort" - aborted before any generation happened (e.g., during tool loading)
    // In this case, no messages were saved to DB, so frontend shouldn't navigate to conversation
    const isEarlyAbort = content.length === 0 && !jobData.responseMessageId;

    // Create final event for abort
    const userMessageId = jobData.userMessage?.messageId;

    const abortFinalEvent: t.ServerSentEvent = {
      final: true,
      // Don't include conversation for early aborts - it doesn't exist in DB
      conversation: isEarlyAbort ? null : { conversationId: jobData.conversationId },
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
      responseMessage: isEarlyAbort
        ? null
        : {
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
      // Flag for early abort - no messages saved, frontend should go to new chat
      earlyAbort: isEarlyAbort,
    } as unknown as t.ServerSentEvent;

    if (runtime) {
      runtime.finalEvent = abortFinalEvent;
    }

    this.eventTransport.emitDone(streamId, abortFinalEvent);
    this.jobStore.clearContentState(streamId);
    this.runStepBuffers?.delete(streamId);

    // Immediate cleanup if configured (default: true)
    if (this._cleanupOnComplete) {
      this.runtimeState.delete(streamId);
      // Don't cleanup eventTransport here - let the abort event fully transmit first.
      await this.jobStore.deleteJob(streamId);
    } else {
      // Only update status if keeping the job around
      await this.jobStore.updateJob(streamId, {
        status: 'aborted',
        completedAt: Date.now(),
      });
    }

    logger.debug(`[GenerationJobManager] Job aborted: ${streamId}`);

    return {
      success: true,
      jobData,
      content,
      finalEvent: abortFinalEvent,
    };
  }

  /**
   * Subscribe to a job's event stream.
   *
   * This is called when an SSE client connects to /chat/stream/:streamId.
   * On first subscription:
   * - Resolves readyPromise (legacy, for API compatibility)
   * - Replays any buffered early events (e.g., 'created' event)
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

    // Check if this is the first subscriber
    const isFirst = this.eventTransport.isFirstSubscriber(streamId);

    // First subscriber: replay buffered events and mark as connected
    if (!runtime.hasSubscriber) {
      runtime.hasSubscriber = true;

      // Replay any events that were emitted before subscriber connected
      if (runtime.earlyEventBuffer.length > 0) {
        logger.debug(
          `[GenerationJobManager] Replaying ${runtime.earlyEventBuffer.length} buffered events for ${streamId}`,
        );
        for (const bufferedEvent of runtime.earlyEventBuffer) {
          onChunk(bufferedEvent);
        }
        // Clear buffer after replay
        runtime.earlyEventBuffer = [];
      }
    }

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
   *
   * If no subscriber has connected yet, buffers the event for replay when they do.
   * This ensures early events (like 'created') aren't lost due to race conditions.
   */
  emitChunk(streamId: string, event: t.ServerSentEvent): void {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime || runtime.abortController.signal.aborted) {
      return;
    }

    // Track user message from created event
    this.trackUserMessage(streamId, event);

    // For Redis mode, persist chunk for later reconstruction
    if (this._isRedis) {
      // The SSE event structure is { event: string, data: unknown, ... }
      // The aggregator expects { event: string, data: unknown } where data is the payload
      const eventObj = event as Record<string, unknown>;
      const eventType = eventObj.event as string | undefined;
      const eventData = eventObj.data;

      if (eventType && eventData !== undefined) {
        // Store in format expected by aggregateContent: { event, data }
        this.jobStore.appendChunk(streamId, { event: eventType, data: eventData }).catch((err) => {
          logger.error(`[GenerationJobManager] Failed to append chunk:`, err);
        });

        // For run step events, also save to run steps key for quick retrieval
        if (eventType === 'on_run_step' || eventType === 'on_run_step_completed') {
          this.saveRunStepFromEvent(streamId, eventData as Record<string, unknown>);
        }
      }
    }

    // Buffer early events if no subscriber yet (replay when first subscriber connects)
    if (!runtime.hasSubscriber) {
      runtime.earlyEventBuffer.push(event);
      // Also emit to transport in case subscriber connects mid-flight
    }

    this.eventTransport.emitChunk(streamId, event);
  }

  /**
   * Extract and save run step from event data.
   * The data is already the run step object from the event payload.
   */
  private saveRunStepFromEvent(streamId: string, data: Record<string, unknown>): void {
    // The data IS the run step object
    const runStep = data as Agents.RunStep;
    if (!runStep.id) {
      return;
    }

    // Fire and forget - accumulate run steps
    this.accumulateRunStep(streamId, runStep);
  }

  /**
   * Accumulate run steps for a stream (Redis mode only).
   * Uses a simple in-memory buffer that gets flushed to Redis.
   * Not used in in-memory mode - run steps come from live graph via WeakRef.
   */
  private runStepBuffers: Map<string, Agents.RunStep[]> | null = null;

  private accumulateRunStep(streamId: string, runStep: Agents.RunStep): void {
    // Lazy initialization - only create map when first used (Redis mode)
    if (!this.runStepBuffers) {
      this.runStepBuffers = new Map();
    }

    let buffer = this.runStepBuffers.get(streamId);
    if (!buffer) {
      buffer = [];
      this.runStepBuffers.set(streamId, buffer);
    }

    // Update or add run step
    const existingIdx = buffer.findIndex((rs) => rs.id === runStep.id);
    if (existingIdx >= 0) {
      buffer[existingIdx] = runStep;
    } else {
      buffer.push(runStep);
    }

    // Save to Redis
    if (this.jobStore.saveRunSteps) {
      this.jobStore.saveRunSteps(streamId, buffer).catch((err) => {
        logger.error(`[GenerationJobManager] Failed to save run steps:`, err);
      });
    }
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
  }

  /**
   * Update job metadata.
   */
  async updateMetadata(
    streamId: string,
    metadata: Partial<t.GenerationJobMetadata>,
  ): Promise<void> {
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
    await this.jobStore.updateJob(streamId, updates);
  }

  /**
   * Set reference to the graph's contentParts array.
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    // Use runtime state check for performance (sync check)
    if (!this.runtimeState.has(streamId)) {
      return;
    }
    this.jobStore.setContentParts(streamId, contentParts);
  }

  /**
   * Set reference to the graph instance.
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    // Use runtime state check for performance (sync check)
    if (!this.runtimeState.has(streamId)) {
      return;
    }
    this.jobStore.setGraph(streamId, graph);
  }

  /**
   * Get resume state for reconnecting clients.
   */
  async getResumeState(streamId: string): Promise<t.ResumeState | null> {
    const jobData = await this.jobStore.getJob(streamId);
    if (!jobData) {
      return null;
    }

    const result = await this.jobStore.getContentParts(streamId);
    const aggregatedContent = result?.content ?? [];
    const runSteps = await this.jobStore.getRunSteps(streamId);

    logger.debug(`[GenerationJobManager] getResumeState:`, {
      streamId,
      runStepsLength: runSteps.length,
      aggregatedContentLength: aggregatedContent.length,
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
   * Also cleans up any orphaned runtime state, buffers, and event transport entries.
   */
  private async cleanup(): Promise<void> {
    const count = await this.jobStore.cleanup();

    // Cleanup runtime state for deleted jobs
    for (const streamId of this.runtimeState.keys()) {
      if (!(await this.jobStore.hasJob(streamId))) {
        this.runtimeState.delete(streamId);
        this.runStepBuffers?.delete(streamId);
        this.jobStore.clearContentState(streamId);
        this.eventTransport.cleanup(streamId);
      }
    }

    // Also check runStepBuffers for any orphaned entries (Redis mode only)
    if (this.runStepBuffers) {
      for (const streamId of this.runStepBuffers.keys()) {
        if (!(await this.jobStore.hasJob(streamId))) {
          this.runStepBuffers.delete(streamId);
        }
      }
    }

    // Check eventTransport for orphaned streams (e.g., connections dropped without clean close)
    // These are streams that exist in eventTransport but have no corresponding job
    for (const streamId of this.eventTransport.getTrackedStreamIds()) {
      if (!(await this.jobStore.hasJob(streamId)) && !this.runtimeState.has(streamId)) {
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

    const result = await this.jobStore.getContentParts(streamId);
    const aggregatedContent = result?.content ?? [];

    return {
      active: jobData.status === 'running',
      status: jobData.status as t.GenerationJobStatus,
      aggregatedContent,
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
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Performs self-healing cleanup of stale entries.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  async getActiveJobIdsForUser(userId: string): Promise<string[]> {
    return this.jobStore.getActiveJobIdsByUser(userId);
  }

  /**
   * Destroy the manager.
   * Cleans up all resources including runtime state, buffers, and stores.
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.jobStore.destroy();
    this.eventTransport.destroy();
    this.runtimeState.clear();
    this.runStepBuffers?.clear();

    logger.debug('[GenerationJobManager] Destroyed');
  }
}

export const GenerationJobManager = new GenerationJobManagerClass();
export { GenerationJobManagerClass };
