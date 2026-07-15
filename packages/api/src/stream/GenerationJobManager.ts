import { logger, getTenantId, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import {
  Constants,
  UsageEvents,
  ApprovalEvents,
  parseTextParts,
  reconcileContextUsage,
  promptTokensFromUsage,
} from 'librechat-data-provider';
import type {
  TMessageContentParts,
  TContextUsageEvent,
  TTokenUsageEvent,
  TPendingSteer,
  Agents,
} from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type {
  SerializableJobData,
  IEventTransport,
  UsageMetadata,
  AbortResult,
  IJobStore,
} from './interfaces/IJobStore';
import type { SteerOwner, SteerContentView } from './SteeringLifecycle';
import type { GenerationJobStore } from '~/app/metrics';
import type * as t from '~/types';
import {
  recordGenerationStreamResumePendingEvents,
  recordGenerationStreamSubscription,
  setGenerationJobsInFlight,
  recordGenerationJob,
} from '~/app/metrics';
import {
  SteeringLifecycle,
  toPendingSteer,
  synthesizeAppliedSteerEvents,
} from './SteeringLifecycle';
import { isPendingActionStale, isPendingActionExpired } from './interfaces/IJobStore';
import { InMemoryEventTransport } from './implementations/InMemoryEventTransport';
import { InMemoryJobStore } from './implementations/InMemoryJobStore';
import { filterPersistableAbortContent } from './abortContent';
import { toClientPendingAction } from '~/agents/hitl/policy';
import { ApprovalLifecycle } from './ApprovalLifecycle';

/** Terminal error surfaced to a client still attached when its approval window lapses. */
const APPROVAL_EXPIRED_ERROR = 'Approval expired before a decision was made';

/** Error surfaced to any client still attached when a stale/hung job is reaped. */
const REAPED_JOB_ERROR = 'Generation timed out';
const OAUTH_TOOL_CALL_PREFIX = `oauth${Constants.mcp_delimiter}`;

function getToolCallName(toolCall: unknown): unknown {
  return toolCall != null && typeof toolCall === 'object' && 'name' in toolCall
    ? toolCall.name
    : undefined;
}

function hasOAuthToolCall(toolCalls: unknown): boolean {
  return (
    Array.isArray(toolCalls) &&
    toolCalls.some((toolCall) => {
      const name = getToolCallName(toolCall);
      return typeof name === 'string' && name.startsWith(OAUTH_TOOL_CALL_PREFIX);
    })
  );
}

function getReplayStepId(event: t.ServerSentEvent): unknown {
  if (!('event' in event) || !event.data || typeof event.data !== 'object') {
    return undefined;
  }

  if (event.event === 'on_run_step' || event.event === 'on_run_step_delta') {
    return 'id' in event.data ? event.data.id : undefined;
  }

  if (event.event === 'on_run_step_completed') {
    const result = 'result' in event.data ? event.data.result : undefined;
    return result != null && typeof result === 'object' && 'id' in result ? result.id : undefined;
  }

  return undefined;
}

function isOAuthReplayEvent(event: t.ServerSentEvent): boolean {
  if (!('event' in event) || !event.data || typeof event.data !== 'object') {
    return false;
  }

  if (event.event === 'on_run_step') {
    const stepDetails = 'stepDetails' in event.data ? event.data.stepDetails : undefined;
    return (
      stepDetails != null &&
      typeof stepDetails === 'object' &&
      'tool_calls' in stepDetails &&
      hasOAuthToolCall(stepDetails.tool_calls)
    );
  }

  if (event.event === 'on_run_step_delta') {
    const delta = 'delta' in event.data ? event.data.delta : undefined;
    if (delta == null || typeof delta !== 'object') {
      return false;
    }
    if (!('tool_calls' in delta) || !hasOAuthToolCall(delta.tool_calls)) {
      return false;
    }

    return true;
  }

  if (event.event === 'on_run_step_completed') {
    const result = 'result' in event.data ? event.data.result : undefined;
    if (result == null || typeof result !== 'object' || !('tool_call' in result)) {
      return false;
    }
    const name = getToolCallName(result.tool_call);
    return typeof name === 'string' && name.startsWith(OAUTH_TOOL_CALL_PREFIX);
  }

  return false;
}

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
 * @property errorEvent - Cached error event for late subscribers (errors before client connects)
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
  errorEvent?: string;
  /** Approval-expired host cleanup already ran for this runtime (relay path is swept repeatedly). */
  approvalCleanupRan?: boolean;
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
  /** Guarded human-review lifecycle (pause / resolve / expire) over the store. */
  private _approvals: ApprovalLifecycle;
  /** FIFO steering queue (enqueue / drain / peek / clear) over the store. */
  private _steering: SteeringLifecycle;
  /** Event pub/sub transport - swappable for Redis Pub/Sub, etc. */
  private eventTransport: IEventTransport;

  /** Runtime state - always in-memory, not serializable */
  private runtimeState = new Map<string, RuntimeJobState>();

  /** Jobs actively generating in this process. */
  private runningJobs = new Set<string>();

  /** Serializes replay-event read/modify/write updates per stream. */
  private replayEventWriteQueues = new Map<string, Promise<void>>();

  /** Serializes token-usage read/modify/write updates per stream. */
  private tokenUsageWriteQueues = new Map<string, Promise<void>>();

  private cleanupInterval: NodeJS.Timeout | null = null;

  /** Whether we're using Redis stores */
  private _isRedis = false;

  /** Whether to cleanup event transport immediately on job completion */
  private _cleanupOnComplete = true;

  /**
   * Host cleanup fired after an approval EXPIRES (periodic sweeper or a stale submit) —
   * e.g. prune the paused run's durable checkpoint eagerly instead of letting it sit
   * until its store TTL. Best-effort: failures are logged, never break the expiry.
   */
  private _onApprovalExpired:
    | ((streamId: string, job?: SerializableJobData | null) => void | Promise<void>)
    | null = null;

  constructor(options?: GenerationJobManagerOptions) {
    this.jobStore =
      options?.jobStore ?? new InMemoryJobStore({ ttlAfterComplete: 0, maxJobs: 1000 });
    this._approvals = new ApprovalLifecycle(this.jobStore);
    this._steering = new SteeringLifecycle(this.jobStore);
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
    const previousStore = this.storeLabel;
    if (this.cleanupInterval) {
      logger.warn(
        '[GenerationJobManager] Reconfiguring after initialization - destroying existing services',
      );
      this.destroy();
    }

    this.runningJobs.clear();
    setGenerationJobsInFlight(previousStore, 0);

    this.jobStore = services.jobStore;
    this._approvals = new ApprovalLifecycle(this.jobStore);
    this._steering = new SteeringLifecycle(this.jobStore);
    this.eventTransport = services.eventTransport;
    this._isRedis = services.isRedis ?? false;
    this._cleanupOnComplete = services.cleanupOnComplete ?? true;
    this.syncRunningJobMetrics();

    logger.info(
      `[GenerationJobManager] Configured with ${this._isRedis ? 'Redis' : 'in-memory'} stores`,
    );
  }

  /**
   * Register a host callback fired after an approval EXPIRES — from the periodic sweeper or
   * a stale submit — e.g. to prune the paused run's durable checkpoint eagerly instead of
   * waiting out its TTL. Unlike {@link configure} this never resets services, so it is safe
   * to call from any startup path (including ones that run on constructor defaults). The
   * `streamId` argument equals the LangGraph `thread_id` (LibreChat's conversationId).
   */
  setApprovalExpiredHandler(
    handler: ((streamId: string, job?: SerializableJobData | null) => void | Promise<void>) | null,
  ): void {
    this._onApprovalExpired = handler;
  }

  /**
   * Check if using Redis stores.
   */
  get isRedis(): boolean {
    return this._isRedis;
  }

  private get storeLabel(): GenerationJobStore {
    return this._isRedis ? 'redis' : 'memory';
  }

  private syncRunningJobMetrics(store: GenerationJobStore = this.storeLabel): void {
    setGenerationJobsInFlight(store, this.runningJobs.size);
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
    const tenantId = getTenantId();
    const safeTenantId = tenantId && tenantId !== SYSTEM_TENANT_ID ? tenantId : undefined;
    const jobData = await this.jobStore.createJob(streamId, userId, conversationId, safeTenantId);

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
    this.runningJobs.add(streamId);
    this.syncRunningJobMetrics();
    recordGenerationJob(this.storeLabel, 'created');

    // Resolve immediately - early event buffer handles late subscribers
    resolveReady!();

    /**
     * Set up all-subscribers-left callback.
     * When all SSE clients disconnect, this:
     * 1. Resets syncSent so reconnecting clients get sync event (persisted to Redis)
     * 2. Calls any registered allSubscribersLeft handlers (e.g., to save partial responses)
     */
    this.eventTransport.onAllSubscribersLeft(streamId, () => {
      const currentRuntime = this.runtimeState.get(streamId);
      if (currentRuntime) {
        currentRuntime.syncSent = false;
        currentRuntime.hasSubscriber = false;
        // Persist syncSent=false to Redis for cross-replica consistency
        this.jobStore.updateJob(streamId, { syncSent: false }).catch((err) => {
          logger.error(`[GenerationJobManager] Failed to persist syncSent=false:`, err);
        });
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

    /**
     * Set up cross-replica abort listener (Redis mode only).
     * When abort is triggered on ANY replica, this replica receives the signal
     * and aborts its local AbortController (if it's the one running generation).
     */
    if (this.eventTransport.onAbort) {
      this.eventTransport.onAbort(streamId, () => {
        const currentRuntime = this.runtimeState.get(streamId);
        if (currentRuntime && !currentRuntime.abortController.signal.aborted) {
          logger.debug(`[GenerationJobManager] Received cross-replica abort for ${streamId}`);
          currentRuntime.abortController.abort();
        }
      });
    }

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
        tenantId: jobData.tenantId,
        conversationId: jobData.conversationId,
        userMessage: jobData.userMessage,
        responseMessageId: jobData.responseMessageId,
        sender: jobData.sender,
        endpoint: jobData.endpoint,
        iconURL: jobData.iconURL,
        model: jobData.model,
        promptTokens: jobData.promptTokens,
        // Surface the originating agent so the resume route can refuse to rebuild a
        // paused run on a different agent.
        agent_id: jobData.agent_id,
        // Surface whether the turn was temporary so a resume keeps it non-persisted.
        isTemporary: jobData.isTemporary,
        // Surface deferred tools discovered before the pause so the resume route can
        // replay them into createRun (the rebuilt graph passes `messages: []`).
        discoveredTools: jobData.discoveredTools,
        // Surface the pending review so status/resume routes built on the
        // facade can render the prompt for a `requires_action` job.
        pendingAction: jobData.pendingAction,
      },
      readyPromise: runtime.readyPromise,
      resolveReady: runtime.resolveReady,
      finalEvent: runtime.finalEvent,
      syncSent: runtime.syncSent,
    };
  }

  /**
   * Get or create runtime state for a job.
   *
   * This enables cross-replica support in Redis mode:
   * - If runtime exists locally (same replica), return it
   * - If job exists in Redis but not locally (cross-replica), create minimal runtime
   *
   * The lazily-created runtime state is sufficient for:
   * - Subscribing to events (via Redis pub/sub)
   * - Getting resume state
   * - Handling reconnections
   * - Receiving cross-replica abort signals (via Redis pub/sub)
   *
   * @param streamId - The stream identifier
   * @returns Runtime state or null if job doesn't exist anywhere
   */
  private async getOrCreateRuntimeState(streamId: string): Promise<RuntimeJobState | null> {
    const existingRuntime = this.runtimeState.get(streamId);
    if (existingRuntime) {
      return existingRuntime;
    }

    // Job doesn't exist locally - check Redis
    const jobData = await this.jobStore.getJob(streamId);
    if (!jobData) {
      return null;
    }

    // Cross-replica scenario: job exists in Redis but not locally
    // Create minimal runtime state for handling reconnection/subscription
    logger.debug(`[GenerationJobManager] Creating cross-replica runtime for ${streamId}`);

    let resolveReady: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    // For jobs created on other replicas, readyPromise should be pre-resolved
    // since generation has already started
    resolveReady!();

    // Parse finalEvent from Redis if available
    let finalEvent: t.ServerSentEvent | undefined;
    if (jobData.finalEvent) {
      try {
        finalEvent = JSON.parse(jobData.finalEvent) as t.ServerSentEvent;
      } catch {
        // Ignore parse errors
      }
    }

    const runtime: RuntimeJobState = {
      abortController: new AbortController(),
      readyPromise,
      resolveReady: resolveReady!,
      syncSent: jobData.syncSent ?? false,
      earlyEventBuffer: [],
      hasSubscriber: false,
      finalEvent,
      errorEvent: jobData.error,
    };

    this.runtimeState.set(streamId, runtime);

    // Set up all-subscribers-left callback for this replica
    this.eventTransport.onAllSubscribersLeft(streamId, () => {
      const currentRuntime = this.runtimeState.get(streamId);
      if (currentRuntime) {
        currentRuntime.syncSent = false;
        currentRuntime.hasSubscriber = false;
        // Persist syncSent=false to Redis
        this.jobStore.updateJob(streamId, { syncSent: false }).catch((err) => {
          logger.error(`[GenerationJobManager] Failed to persist syncSent=false:`, err);
        });
        // Call registered handlers
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

    // Set up cross-replica abort listener (Redis mode only)
    // This ensures lazily-initialized jobs can receive abort signals
    if (this.eventTransport.onAbort) {
      this.eventTransport.onAbort(streamId, () => {
        const currentRuntime = this.runtimeState.get(streamId);
        if (currentRuntime && !currentRuntime.abortController.signal.aborted) {
          logger.debug(
            `[GenerationJobManager] Received cross-replica abort for lazily-init job ${streamId}`,
          );
          currentRuntime.abortController.abort();
        }
      });
    }

    return runtime;
  }

  /**
   * Get a job by streamId.
   */
  async getJob(streamId: string): Promise<t.GenerationJob | undefined> {
    const jobData = await this.jobStore.getJob(streamId);
    if (!jobData) {
      return undefined;
    }

    const runtime = await this.getOrCreateRuntimeState(streamId);
    if (!runtime) {
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
   * Exception: Jobs with errors are NOT immediately deleted to allow late-connecting
   * clients to receive the error (race condition where error occurs before client connects).
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
    this.replayEventWriteQueues.delete(streamId);
    this.tokenUsageWriteQueues.delete(streamId);
    // Backstop for direct terminal callers (init failures, unhandled errors)
    // that never ran the controllers' close-and-park: close the queue, then
    // park any 202-accepted leftovers for /chat/status claim-on-read instead
    // of silently clearing them. Paths that already drained find an empty
    // queue and no-op; the createdAt guard (re-checked inside the store's
    // atomic drain) keeps a stale completion off a replacement job's queue.
    // Runs BEFORE the terminal status write — the Redis terminal cleanup DELs
    // the queue key.
    try {
      const jobData = await this.jobStore.getJob(streamId);
      if (jobData) {
        const leftovers = (
          await this.jobStore.closeAndDrainSteers(streamId, jobData.createdAt)
        ).map(toPendingSteer);
        await this._steering.park(streamId, leftovers, {
          userId: jobData.userId,
          tenantId: jobData.tenantId,
        });
      }
    } catch (err) {
      logger.warn(`[GenerationJobManager] Failed to park leftover steers for ${streamId}:`, err);
    }

    // For error jobs, DON'T delete immediately - keep around so late-connecting
    // clients can receive the error. This handles the race condition where error
    // occurs before client connects to SSE stream.
    //
    // Cleanup strategy: Error jobs are cleaned up by periodic cleanup (every 60s)
    // via jobStore.cleanup() which checks for jobs with status 'error' and
    // completedAt set. The TTL is configurable via jobStore options (default: 0,
    // meaning cleanup on next interval). This gives clients ~60s to connect and
    // receive the error before the job is removed.
    if (error) {
      await this.jobStore.updateJob(streamId, {
        status: 'error',
        completedAt: Date.now(),
        error,
      });
      this.runningJobs.delete(streamId);
      this.syncRunningJobMetrics();
      recordGenerationJob(this.storeLabel, 'error');
      // Keep runtime state so subscribe() can access errorEvent
      logger.debug(
        `[GenerationJobManager] Job completed with error (keeping for late subscribers): ${streamId}`,
      );
      return;
    }

    // Immediate cleanup if configured (default: true) - only for successful completions
    if (this._cleanupOnComplete) {
      this.runtimeState.delete(streamId);
      // Don't cleanup eventTransport here - let the done event fully transmit first.
      // EventTransport will be cleaned up when subscribers disconnect or by periodic cleanup.
      await this.jobStore.deleteJob(streamId);
    } else {
      // Only update status if keeping the job around
      await this.jobStore.updateJob(streamId, {
        status: 'complete',
        completedAt: Date.now(),
      });
    }

    this.runningJobs.delete(streamId);
    this.syncRunningJobMetrics();
    recordGenerationJob(this.storeLabel, 'completed');
    logger.debug(`[GenerationJobManager] Job completed: ${streamId}`);
  }

  /**
   * Abort a job (user-initiated).
   * Returns all data needed for token spending and message saving.
   *
   * Cross-replica support (Redis mode):
   * - Emits abort signal via Redis pub/sub
   * - The replica running generation receives signal and aborts its AbortController
   *
   * `options.transformAbortContent` rewrites the persistable content BEFORE the
   * final SSE is emitted (and before it is returned for the DB save), so a
   * host-side stamp — e.g. re-attaching a paused `ask_user_question`'s args
   * that the Redis chunk-log reconstruction dropped — reaches the LIVE client
   * too, not just the saved message. Pure/optional; identity when omitted.
   */
  async abortJob(
    streamId: string,
    options?: {
      transformAbortContent?: (content: TMessageContentParts[]) => TMessageContentParts[];
    },
  ): Promise<AbortResult> {
    const jobData = await this.jobStore.getJob(streamId);
    const runtime = this.runtimeState.get(streamId);

    if (!jobData) {
      logger.warn(`[GenerationJobManager] Cannot abort - job not found: ${streamId}`);
      recordGenerationJob(this.storeLabel, 'abort_failed');
      return {
        text: '',
        content: [],
        jobData: null,
        success: false,
        finalEvent: null,
        collectedUsage: [],
      };
    }

    // Emit abort signal for cross-replica support (Redis mode)
    // This ensures the generating replica receives the abort signal
    if (this.eventTransport.emitAbort) {
      this.eventTransport.emitAbort(streamId);
    }

    // Also abort local controller if we have it (same-replica abort)
    if (runtime) {
      runtime.abortController.abort();
    }

    /** Steers that never reached an injection boundary — reported on the abort
     *  final event (and the abort route's JSON) so the client can restore them
     *  as queued chips instead of silently dropping the user's words. The
     *  close-and-drain rejects any steer POST racing this finalization, and
     *  the createdAt guard keeps it off a replacement job's queue. Runs
     *  BEFORE the content snapshot below: a drain hook that already popped a
     *  steer and applied its part gets captured by the snapshot, so the text
     *  surfaces either here (pendingSteers) or there (inline part) — an
     *  encode still in flight across the abort remains inherently racy
     *  cross-instance, but the window no longer includes completed applies. */
    const pendingSteers = (
      await this.jobStore.closeAndDrainSteers(streamId, jobData.createdAt)
    ).map(toPendingSteer);
    // No-subscriber recovery: the abort response/final are transient, so park
    // the leftovers for /chat/status claim-on-read within the recovery TTL.
    await this.steering.park(streamId, pendingSteers, {
      userId: jobData.userId,
      tenantId: jobData.tenantId,
    });

    /** Content before clearing state */
    const result = await this.jobStore.getContentParts(streamId);
    const content = result?.content ?? [];
    let abortContent = filterPersistableAbortContent(content);
    if (options?.transformAbortContent) {
      abortContent = options.transformAbortContent(
        abortContent as TMessageContentParts[],
      ) as typeof abortContent;
    }
    const shouldPersistAbortContent = abortContent.length > 0;

    /** Collected usage for all models */
    const collectedUsage = this.jobStore.getCollectedUsage(streamId);

    /** Text from content parts for fallback token counting; the persisted
     *  abort record keeps steered words (they reached the model context). */
    const text = shouldPersistAbortContent
      ? parseTextParts(abortContent as TMessageContentParts[], false, { includeSteer: true })
      : '';

    /** Detect "early abort" - aborted before any generation happened (e.g., during tool loading)
    In this case, no messages were saved to DB, so frontend shouldn't navigate to conversation */
    const isEarlyAbort = !shouldPersistAbortContent && jobData.createdEventEmitted !== true;

    /** Final event for abort */
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
            quotes: jobData.userMessage.quotes,
            isCreatedByUser: true,
          }
        : null,
      responseMessage: isEarlyAbort
        ? null
        : {
            messageId: jobData.responseMessageId ?? `${userMessageId ?? 'aborted'}_`,
            parentMessageId: userMessageId,
            conversationId: jobData.conversationId,
            content: abortContent,
            sender: jobData.sender ?? 'AI',
            endpoint: jobData.endpoint,
            iconURL: jobData.iconURL,
            model: jobData.model,
            unfinished: true,
            error: false,
            isCreatedByUser: false,
          },
      aborted: true,
      // Flag for early abort - no messages saved, frontend should go to new chat
      earlyAbort: isEarlyAbort,
      ...(pendingSteers.length > 0 && { pendingSteers }),
    } satisfies t.FinalEvent as t.ServerSentEvent;

    if (runtime) {
      runtime.finalEvent = abortFinalEvent;
    }

    await this.eventTransport.emitDone(streamId, abortFinalEvent);
    this.jobStore.clearContentState(streamId);
    this.runStepBuffers?.delete(streamId);
    this.replayEventWriteQueues.delete(streamId);
    this.tokenUsageWriteQueues.delete(streamId);

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

    this.runningJobs.delete(streamId);
    this.syncRunningJobMetrics();
    recordGenerationJob(this.storeLabel, 'aborted');
    logger.debug(`[GenerationJobManager] Job aborted: ${streamId}`);

    return {
      success: true,
      jobData,
      content: abortContent,
      finalEvent: abortFinalEvent,
      text,
      collectedUsage,
      ...(pendingSteers.length > 0 && { pendingSteers }),
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
   * Supports cross-replica reconnection in Redis mode:
   * - If job exists in Redis but not locally, creates minimal runtime state
   * - Events are delivered via Redis pub/sub, not in-memory EventEmitter
   *
   * @param streamId - The stream to subscribe to
   * @param onChunk - Handler for chunk events (streamed tokens, run steps, etc.)
   * @param onDone - Handler for completion event (includes final message)
   * @param onError - Handler for error events
   * @param options - Subscription configuration
   * @param options.skipBufferReplay - When true, skips replaying the earlyEventBuffer.
   *   Use this when a sync event was already sent (resume), since the sync's
   *   aggregatedContent already includes all buffered events.
   * @returns Subscription object with unsubscribe function, or null if job not found
   */
  async subscribe(
    streamId: string,
    onChunk: t.ChunkHandler,
    onDone?: t.DoneHandler,
    onError?: t.ErrorHandler,
    options?: t.SubscribeOptions,
  ): Promise<{ unsubscribe: t.UnsubscribeFn } | null> {
    const subscriptionType = options?.skipBufferReplay ? 'resume' : 'initial';
    // Use lazy initialization to support cross-replica subscriptions
    const runtime = await this.getOrCreateRuntimeState(streamId);
    if (!runtime) {
      recordGenerationStreamSubscription(this.storeLabel, subscriptionType, 'not_found');
      return null;
    }

    const jobData = await this.jobStore.getJob(streamId);

    // If job already complete/error, send final event or error
    // Error status takes precedence to ensure errors aren't misreported as successes
    setImmediate(() => {
      if (jobData && ['complete', 'error', 'aborted'].includes(jobData.status)) {
        // Check for error status FIRST and prioritize error handling
        if (jobData.status === 'error' && (runtime.errorEvent || jobData.error)) {
          const errorToSend = runtime.errorEvent ?? jobData.error;
          if (errorToSend) {
            logger.debug(
              `[GenerationJobManager] Sending stored error to late subscriber: ${streamId}`,
            );
            onError?.(errorToSend);
          }
        } else if (runtime.finalEvent) {
          onDone?.(runtime.finalEvent);
        }
      }
    });

    const subscription = this.eventTransport.subscribe(streamId, {
      onChunk: (event) => {
        const e = event as t.ServerSentEvent;
        if (!(e as Record<string, unknown>)._internal) {
          onChunk(e);
        }
      },
      onDone: (event) => onDone?.(event as t.ServerSentEvent),
      onError,
    });

    try {
      if (subscription.ready) {
        await subscription.ready;
      }
      recordGenerationStreamSubscription(this.storeLabel, subscriptionType, 'success');
    } catch (err) {
      recordGenerationStreamSubscription(this.storeLabel, subscriptionType, 'error');
      throw err;
    }

    const isFirst = this.eventTransport.isFirstSubscriber(streamId);

    if (!runtime.hasSubscriber) {
      runtime.hasSubscriber = true;

      /**
       * Pass earlyReplayCount to syncReorderBuffer so it can prune duplicate pub/sub
       * entries (seqs 0..count-1) without touching live in-flight chunks.
       *
       * Only set when the buffer was actually replayed — those specific seqs were
       * delivered via onChunk and their pub/sub copies are duplicates.
       * When skipBufferReplay is true, the resume sync payload delivers aggregated
       * content up to the Redis counter, so syncReorderBuffer should trust currentSeq
       * as the frontier (earlyReplayCount = 0).
       */
      let earlyReplayCount = 0;

      if (runtime.earlyEventBuffer.length > 0) {
        if (options?.skipBufferReplay) {
          logger.debug(
            `[GenerationJobManager] Skipping ${runtime.earlyEventBuffer.length} buffered events for ${streamId} (skipBufferReplay)`,
          );
        } else {
          earlyReplayCount = runtime.earlyEventBuffer.length;
          logger.debug(
            `[GenerationJobManager] Replaying ${earlyReplayCount} buffered events for ${streamId}`,
          );
          for (const bufferedEvent of runtime.earlyEventBuffer) {
            onChunk(bufferedEvent);
          }
        }
        runtime.earlyEventBuffer = [];
      } else if (this._isRedis && !options?.skipBufferReplay && jobData?.userMessage) {
        /**
         * Cross-replica fallback: the created event was buffered on the generating
         * instance and published via Redis pub/sub before this subscriber was active.
         * Reconstruct from persisted metadata. Only fields stored by trackUserMessage()
         * are available (messageId, parentMessageId, conversationId, text);
         * sender/isCreatedByUser are invariant for user messages and added back here.
         */
        logger.debug(
          `[GenerationJobManager] Cross-replica subscribe: emitting created event from metadata for ${streamId}`,
        );
        const createdEvent: t.CreatedEvent = {
          created: true,
          message: {
            ...jobData.userMessage,
            sender: 'User',
            isCreatedByUser: true,
          },
          streamId,
        };
        onChunk(createdEvent);
      }

      try {
        await this.eventTransport.syncReorderBuffer?.(streamId, earlyReplayCount);
      } catch (err) {
        logger.warn(
          `[GenerationJobManager] Failed to sync reorder buffer for ${streamId}; proceeding with current nextSeq:`,
          err,
        );
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
   * Atomic resume + subscribe: snapshots resume state and drains the early event buffer
   * in one synchronous step, then subscribes with skipBufferReplay.
   *
   * Closes the timing gap between separate `getResumeState()` and `subscribe()` calls
   * where events could arrive in earlyEventBuffer after the snapshot but before subscribe
   * clears the buffer.
   *
   * In-memory mode: drained buffer events are returned as `pendingEvents` since
   * they exist nowhere else. The caller must deliver them after the sync payload.
   * Redis mode: `pendingEvents` is empty — chunks are persisted via appendChunk
   * and will appear in aggregatedContent on the next resume.
   */
  async subscribeWithResume(
    streamId: string,
    onChunk: t.ChunkHandler,
    onDone?: t.DoneHandler,
    onError?: t.ErrorHandler,
  ): Promise<t.SubscribeWithResumeResult> {
    const bufferLengthAtSnapshot = !this._isRedis
      ? (this.runtimeState.get(streamId)?.earlyEventBuffer.length ?? 0)
      : 0;

    const resumeState = await this.getResumeState(streamId);
    recordGenerationStreamSubscription(
      this.storeLabel,
      'resume_state',
      resumeState ? 'found' : 'missing',
    );

    let pendingEvents: t.ServerSentEvent[] = [];
    if (!this._isRedis) {
      const runtime = this.runtimeState.get(streamId);
      if (runtime) {
        pendingEvents = runtime.earlyEventBuffer.slice(bufferLengthAtSnapshot);
        runtime.earlyEventBuffer = [];
        if (pendingEvents.length > 0) {
          recordGenerationStreamResumePendingEvents(this.storeLabel, pendingEvents.length);
          logger.debug(
            `[GenerationJobManager] Captured ${pendingEvents.length} gap events for ${streamId}`,
          );
        }
      }
    }

    const subscription = await this.subscribe(streamId, onChunk, onDone, onError, {
      skipBufferReplay: true,
    });

    // Close the snapshot→subscribe race: getResumeState() snapshots BEFORE we attach the
    // subscription, so a pause that becomes durable in that window is in neither
    // resumeState.pendingAction nor (Redis mode) pendingEvents — and trackReplayEvent does
    // not persist approval events — leaving the client attached to a paused job with no
    // approval UI. Re-read the live job AFTER subscribing; if it is now requires_action and
    // the snapshot didn't already carry the action, surface it as a pending event so the
    // approval prompt renders. Idempotent: a pause landing AFTER attach is delivered live
    // too, and the client's handler just sets the current action, so a duplicate is benign.
    const liveJob = await this.jobStore.getJob(streamId);
    if (!resumeState?.pendingAction) {
      if (
        liveJob?.status === 'requires_action' &&
        liveJob.pendingAction != null &&
        !isPendingActionStale(liveJob)
      ) {
        pendingEvents = [
          ...pendingEvents,
          {
            event: ApprovalEvents.ON_PENDING_ACTION,
            data: toClientPendingAction(liveJob.pendingAction) as unknown as Record<
              string,
              unknown
            >,
          },
        ];
      }
    }

    // Same snapshot→subscribe race for steers: a steer accepted (and possibly
    // applied) in the window is invisible to the snapshot, since the Redis
    // `on_steer_applied` publish is fire-and-forget and the sync payload has no
    // pendingSteers (in-memory covers it via the early buffer, where this
    // re-check is a cheap no-op). Always re-peek for still-active jobs,
    // treating a missing snapshot queue as empty; terminal jobs skip because
    // the final event owns steer delivery. The content re-read runs only when
    // the queue shows gap activity, and synthesis sources from the FRESH
    // content view so an applied steer with no snapshot id still surfaces.
    const jobActive = liveJob?.status === 'running' || liveJob?.status === 'requires_action';
    if (resumeState != null && jobActive) {
      const snapshotSteers = resumeState.pendingSteers ?? [];
      const liveQueue = await this.jobStore.peekSteers(streamId);
      const liveIds = new Set(liveQueue.map((item) => item.steerId));
      const queueChanged =
        liveQueue.length !== snapshotSteers.length ||
        snapshotSteers.some((steer) => !liveIds.has(steer.steerId));
      if (queueChanged) {
        const livePending = liveQueue.map(toPendingSteer);
        resumeState.pendingSteers = livePending.length > 0 ? livePending : undefined;
      }
      if (queueChanged || liveQueue.length > 0) {
        const contentResult = await this.jobStore.getContentParts(streamId);
        const gapEvents = synthesizeAppliedSteerEvents(
          (resumeState.aggregatedContent ?? []) as SteerContentView,
          liveQueue,
          (contentResult?.content ?? []) as SteerContentView,
          { conversationId: streamId, responseMessageId: resumeState.responseMessageId },
        );
        if (gapEvents.length > 0) {
          pendingEvents = [...pendingEvents, ...gapEvents];
        }
      }
    }

    return { subscription, resumeState, pendingEvents };
  }

  /**
   * Emit a chunk event to all subscribers.
   * Uses runtime state check for performance (avoids async job store lookup per token).
   *
   * If no subscriber has connected yet, buffers the event for replay when they do.
   * This ensures early events (like 'created') aren't lost due to race conditions.
   *
   * In Redis mode, awaits the publish to guarantee event ordering.
   * This is critical for streaming deltas (tool args, message content) to arrive in order.
   *
   * `options.durable` additionally awaits the Redis chunk append BEFORE the
   * transport publish (still best-effort on failure): events whose durable
   * record is the recovery source (e.g. `on_steer_applied`) must be in the
   * chunk log before any subscriber can observe the publish, or a
   * cross-replica reconnect can reconstruct content without them. The default
   * stays fire-and-forget — no added latency on the per-delta hot path.
   */
  async emitChunk(
    streamId: string,
    event: t.ServerSentEvent,
    options?: { durable?: boolean },
  ): Promise<void> {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime || runtime.abortController.signal.aborted) {
      return;
    }

    // Refresh job activity so the store's stale-job failsafe reaps on inactivity
    // (a hung generation), not on age (a long but live stream). Parity with
    // RedisJobStore refreshing the running TTL on each appendChunk.
    this.jobStore.recordActivity?.(streamId);

    await this.trackUserMessage(streamId, event);
    await this.trackTitleEvent(streamId, event);
    await this.trackReplayEvent(streamId, event);
    await this.trackContextUsage(streamId, event);
    await this.trackTokenUsage(streamId, event);

    // For Redis mode, persist chunk for later reconstruction (fire-and-forget for resumability)
    if (this._isRedis) {
      // The SSE event structure is { event: string, data: unknown, ... }
      // The aggregator expects { event: string, data: unknown } where data is the payload
      const eventObj = event as Record<string, unknown>;
      const eventType = eventObj.event as string | undefined;
      const eventData = eventObj.data;

      if (eventType && eventData !== undefined) {
        // Store in format expected by aggregateContent: { event, data }
        const appendPromise = this.jobStore
          .appendChunk(streamId, { event: eventType, data: eventData })
          .catch((err) => {
            logger.error(`[GenerationJobManager] Failed to append chunk:`, err);
          });

        // For run step events, also save to run steps key for quick retrieval
        if (eventType === 'on_run_step' || eventType === 'on_run_step_completed') {
          this.saveRunStepFromEvent(streamId, eventData as Record<string, unknown>);
        }

        if (options?.durable === true) {
          await appendPromise;
        }
      }
    }

    if (!runtime.hasSubscriber) {
      runtime.earlyEventBuffer.push(event);
      if (!this._isRedis) {
        return;
      }
    }

    await this.eventTransport.emitChunk(streamId, event);
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
   * Persist the last title event so resume sync can replay it. Content
   * aggregation only reconstructs message parts, so UI-only events need their
   * own metadata slot.
   */
  private async trackTitleEvent(streamId: string, event: t.ServerSentEvent): Promise<void> {
    if (!('event' in event) || event.event !== 'title') {
      return;
    }

    await this.jobStore.updateJob(streamId, {
      titleEvent: JSON.stringify(event),
    });
  }

  /**
   * Persist the latest context usage snapshot (one per model call) so a
   * resuming client can restore the context gauge without waiting for the
   * next model call.
   */
  private async trackContextUsage(streamId: string, event: t.ServerSentEvent): Promise<void> {
    if (!('event' in event) || event.event !== UsageEvents.ON_CONTEXT_USAGE) {
      return;
    }

    /** Share the token-usage queue so snapshot + usage writes are serialized per
     *  stream: `persistTokenUsage` reconciles the stored snapshot (read-modify-
     *  write), and a snapshot landing between its read and write — or a stale
     *  reconciled write landing after a newer snapshot — would clobber the newer
     *  run's gauge when visible calls interleave. FIFO ordering keeps each call's
     *  pre-invoke snapshot ahead of its own usage and behind the next snapshot. */
    await this.queueJobWrite(this.tokenUsageWriteQueues, streamId, () =>
      this.jobStore.updateJob(streamId, {
        contextUsage: JSON.stringify((event as { data?: unknown }).data ?? null),
      }),
    );
  }

  /**
   * Chains a read/modify/write job update onto the stream's queue so
   * concurrent writers can't clobber each other's merged state.
   */
  private async queueJobWrite(
    queues: Map<string, Promise<void>>,
    streamId: string,
    write: () => Promise<void>,
  ): Promise<void> {
    const previousWrite = queues.get(streamId) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => {
        // Keep the queue moving even if a prior metadata write failed.
      })
      .then(write);

    queues.set(streamId, nextWrite);

    try {
      await nextWrite;
    } finally {
      if (queues.get(streamId) === nextWrite) {
        queues.delete(streamId);
      }
    }
  }

  /**
   * Persist replay-only stream events that are needed to reconstruct active
   * UI state on resume but are not represented by aggregated message content.
   */
  private async trackReplayEvent(streamId: string, event: t.ServerSentEvent): Promise<void> {
    if (!isOAuthReplayEvent(event)) {
      return;
    }

    await this.queueJobWrite(this.replayEventWriteQueues, streamId, () =>
      this.persistReplayEvent(streamId, event),
    );
  }

  /**
   * Persist per-model-call token usage so resuming clients can rebuild
   * usage totals on any replica (the live collectedUsage array only exists
   * on the generating instance).
   */
  private async trackTokenUsage(streamId: string, event: t.ServerSentEvent): Promise<void> {
    if (!('event' in event) || event.event !== UsageEvents.ON_TOKEN_USAGE) {
      return;
    }

    await this.queueJobWrite(this.tokenUsageWriteQueues, streamId, () =>
      this.persistTokenUsage(streamId, event as { data?: unknown }),
    );
  }

  private async persistTokenUsage(streamId: string, event: { data?: unknown }): Promise<void> {
    const jobData = await this.jobStore.getJob(streamId);
    if (!jobData || event.data == null) {
      return;
    }

    let tokenUsage: unknown[] = [];
    if (jobData.tokenUsage) {
      try {
        tokenUsage = JSON.parse(jobData.tokenUsage) as unknown[];
      } catch {
        tokenUsage = [];
      }
    }
    tokenUsage.push(event.data);

    const update: Partial<SerializableJobData> = { tokenUsage: JSON.stringify(tokenUsage) };

    /** Reconcile the resume snapshot to this call's ACTUAL prompt tokens. A primary
     *  usage is the post-invoke truth for the call the latest stored snapshot
     *  precedes (no snapshot is captured between a call's pre-invoke dispatch and
     *  its usage), so a resuming client restores the real context instead of the
     *  calibration-inflated estimate — and a mid-call resume (no usage yet) simply
     *  keeps the raw snapshot rather than mis-applying an earlier call's tokens. */
    const usage = event.data as TTokenUsageEvent;
    if (usage.usage_type == null && jobData.contextUsage) {
      try {
        const snapshot = JSON.parse(jobData.contextUsage) as TContextUsageEvent | null;
        if (
          snapshot != null &&
          (snapshot.runId == null || usage.runId == null || snapshot.runId === usage.runId)
        ) {
          update.contextUsage = JSON.stringify(
            reconcileContextUsage(snapshot, promptTokensFromUsage(usage)),
          );
        }
      } catch {
        /* leave the stored snapshot as-is on parse failure */
      }
    }

    await this.jobStore.updateJob(streamId, update);
  }

  private async persistReplayEvent(streamId: string, event: t.ServerSentEvent): Promise<void> {
    const jobData = await this.jobStore.getJob(streamId);
    if (!jobData) {
      return;
    }

    let replayEvents: t.ServerSentEvent[] = [];
    if (jobData.replayEvents) {
      try {
        replayEvents = JSON.parse(jobData.replayEvents) as t.ServerSentEvent[];
      } catch {
        replayEvents = [];
      }
    }

    const stepId = getReplayStepId(event);
    const eventName = 'event' in event ? event.event : undefined;
    const existingIndex =
      stepId == null
        ? -1
        : replayEvents.findIndex((candidate) => {
            if (!('event' in candidate) || candidate.event !== eventName) {
              return false;
            }
            return getReplayStepId(candidate) === stepId;
          });

    if (existingIndex >= 0) {
      replayEvents[existingIndex] = event;
    } else {
      replayEvents.push(event);
    }

    await this.jobStore.updateJob(streamId, {
      replayEvents: JSON.stringify(replayEvents),
    });
  }

  /**
   * Persist user message metadata from the created event.
   * Awaited in emitChunk so the HSET commits before the PUBLISH,
   * guaranteeing any cross-replica getJob() after the pub/sub window
   * finds userMessage in Redis.
   */
  private async trackUserMessage(streamId: string, event: t.ServerSentEvent): Promise<void> {
    if (!('created' in event)) {
      return;
    }

    const { message } = event;
    const extra = message as {
      manualSkills?: string[];
      alwaysAppliedSkills?: string[];
      files?: unknown[];
    };
    const updates: Partial<SerializableJobData> = {
      createdEventEmitted: true,
      userMessage: {
        messageId: message.messageId,
        parentMessageId: message.parentMessageId,
        conversationId: message.conversationId,
        text: message.text,
        quotes: message.quotes,
        // Persist the turn's uploaded files so a HITL resume sources them from the job
        // (this authoritative writer), not a user DB row whose save can still be racing
        // the approval prompt.
        ...(Array.isArray(extra.files) && extra.files.length > 0 && { files: extra.files }),
        // Carry skill selections so a HITL resume's reconstructed requestMessage keeps
        // its pills — this is the authoritative writer of job.metadata.userMessage and
        // would otherwise drop them (the emitted created message includes them).
        ...(Array.isArray(extra.manualSkills) &&
          extra.manualSkills.length > 0 && { manualSkills: extra.manualSkills }),
        ...(Array.isArray(extra.alwaysAppliedSkills) &&
          extra.alwaysAppliedSkills.length > 0 && {
            alwaysAppliedSkills: extra.alwaysAppliedSkills,
          }),
      },
    };

    if (message.conversationId) {
      updates.conversationId = message.conversationId;
    }

    await this.jobStore.updateJob(streamId, updates);
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
    if (metadata.agent_id) {
      updates.agent_id = metadata.agent_id;
    }
    if (metadata.isTemporary !== undefined) {
      updates.isTemporary = metadata.isTemporary;
    }
    if (metadata.promptTokens !== undefined) {
      updates.promptTokens = metadata.promptTokens;
    }
    if (metadata.discoveredTools) {
      updates.discoveredTools = metadata.discoveredTools;
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
   * Set reference to the collectedUsage array.
   * This array accumulates token usage from all models during generation.
   */
  setCollectedUsage(streamId: string, collectedUsage: UsageMetadata[]): void {
    // Use runtime state check for performance (sync check)
    if (!this.runtimeState.has(streamId)) {
      return;
    }
    this.jobStore.setCollectedUsage(streamId, collectedUsage);
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
   * The guarded human-review lifecycle for paused runs:
   * `approvals.pause()` / `peek()` / `resolve()` / `expire()`.
   *
   * This is the seam approval routes, the status endpoint, and the run wiring
   * cross — it owns the legal `requires_action` transitions and is race-safe
   * against concurrent resumes (a double-resolve would otherwise drive the run
   * twice). The job's chunks, run steps, and user-active-set membership are
   * preserved across a pause so the resume path can rebuild context; the store
   * refreshes the job-hash TTL to give the user the full window to respond.
   */
  get approvals(): ApprovalLifecycle {
    return this._approvals;
  }

  /**
   * The FIFO steering queue for mid-run user messages:
   * `steering.enqueue()` / `drain()` / `peek()` / `clear()`.
   *
   * The steer route enqueues from any instance; the owning process's
   * run-scoped PostToolBatch hook drains at the next tool-batch boundary.
   * Finalization paths drain leftovers into the final/abort events so the
   * client can convert them to queued follow-ups.
   */
  get steering(): SteeringLifecycle {
    return this._steering;
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
    let titleEvent: t.ResumeState['titleEvent'];
    if (jobData.titleEvent) {
      try {
        titleEvent = JSON.parse(jobData.titleEvent) as t.ResumeState['titleEvent'];
      } catch {
        // Ignore malformed persisted title events.
      }
    }
    let replayEvents: t.ResumeState['replayEvents'];
    if (jobData.replayEvents) {
      try {
        replayEvents = JSON.parse(jobData.replayEvents) as t.ResumeState['replayEvents'];
      } catch {
        // Ignore malformed persisted replay events.
      }
    }

    let contextUsage: t.ResumeState['contextUsage'];
    if (jobData.contextUsage) {
      try {
        contextUsage = JSON.parse(jobData.contextUsage) as t.ResumeState['contextUsage'];
      } catch {
        // Ignore malformed persisted context usage.
      }
    }

    /** Persisted per model call by trackTokenUsage — unlike the live
     *  collectedUsage reference, this survives cross-replica resumes. */
    let collectedUsage: t.ResumeState['collectedUsage'];
    if (jobData.tokenUsage) {
      try {
        const parsed = JSON.parse(jobData.tokenUsage) as t.ResumeState['collectedUsage'];
        collectedUsage = parsed && parsed.length > 0 ? parsed : undefined;
      } catch {
        // Ignore malformed persisted token usage.
      }
    }

    /** Steers still queued (not yet injected); injected ones are already in aggregatedContent. */
    const pendingSteers = (await this.jobStore.peekSteers(streamId)).map(toPendingSteer);

    logger.debug(`[GenerationJobManager] getResumeState:`, {
      streamId,
      runStepsLength: runSteps.length,
      aggregatedContentLength: aggregatedContent.length,
      collectedUsageLength: collectedUsage?.length ?? 0,
    });

    return {
      runSteps,
      aggregatedContent,
      userMessage: jobData.userMessage,
      responseMessageId: jobData.responseMessageId,
      conversationId: jobData.conversationId,
      sender: jobData.sender,
      iconURL: jobData.iconURL,
      model: jobData.model,
      titleEvent,
      replayEvents,
      collectedUsage,
      contextUsage,
      // Carry the live pending approval in the resume contract so a reloading /
      // cross-replica client can rebuild the prompt from resumeState. Client-safe
      // projection: the stored record's resumeContext/requestFingerprint stay server-only.
      pendingAction:
        jobData.status === 'requires_action' && !isPendingActionStale(jobData)
          ? toClientPendingAction(jobData.pendingAction)
          : undefined,
      pendingSteers: pendingSteers.length > 0 ? pendingSteers : undefined,
    };
  }

  /**
   * Mark that sync has been sent.
   * Persists to Redis for cross-replica consistency.
   */
  markSyncSent(streamId: string): void {
    const runtime = this.runtimeState.get(streamId);
    if (runtime) {
      runtime.syncSent = true;
    }
    // Persist to Redis for cross-replica consistency
    this.jobStore.updateJob(streamId, { syncSent: true }).catch((err) => {
      logger.error(`[GenerationJobManager] Failed to persist syncSent flag:`, err);
    });
  }

  /**
   * Check if sync has been sent.
   * Checks local runtime first, then falls back to Redis for cross-replica scenarios.
   */
  async wasSyncSent(streamId: string): Promise<boolean> {
    const localSyncSent = this.runtimeState.get(streamId)?.syncSent;
    if (localSyncSent !== undefined) {
      return localSyncSent;
    }
    // Cross-replica: check Redis
    const jobData = await this.jobStore.getJob(streamId);
    return jobData?.syncSent ?? false;
  }

  /**
   * Emit a done event.
   * Persists finalEvent to Redis for cross-replica access.
   */
  async emitDone(streamId: string, event: t.ServerSentEvent): Promise<void> {
    const runtime = this.runtimeState.get(streamId);
    if (runtime) {
      runtime.finalEvent = event;
    }
    // Persist finalEvent to Redis for cross-replica consistency
    this.jobStore.updateJob(streamId, { finalEvent: JSON.stringify(event) }).catch((err) => {
      logger.error(`[GenerationJobManager] Failed to persist finalEvent:`, err);
    });
    await this.eventTransport.emitDone(streamId, event);
  }

  /**
   * Emit an error event.
   * Stores the error for late-connecting subscribers (race condition where error
   * occurs before client connects to SSE stream).
   */
  async emitError(streamId: string, error: string): Promise<void> {
    const runtime = this.runtimeState.get(streamId);
    if (runtime) {
      runtime.errorEvent = error;
    }
    // Persist error to job store for cross-replica consistency
    this.jobStore.updateJob(streamId, { error }).catch((err) => {
      logger.error(`[GenerationJobManager] Failed to persist error:`, err);
    });
    await this.eventTransport.emitError(streamId, error);
  }

  /**
   * Cleanup expired jobs.
   * Also cleans up any orphaned runtime state, buffers, and event transport entries.
   */
  /**
   * Expire any locally-tracked approval whose window has lapsed: drive the atomic
   * `requires_action → aborted` transition and, if this caller won it, emit a
   * terminal error so a connected SSE client closes. Only streams this replica has
   * runtime for are scanned — those are exactly the ones with a client subscribed
   * here; a paused job on another replica is finalized by that replica's sweep (and
   * the store's own cleanup). The durable checkpoint is reclaimed by its Mongo TTL
   * index, which shares the approval window, so no cross-layer delete is needed here.
   */
  /**
   * Expire a single observed-stale pending approval NOW (immediate, not via the periodic
   * sweep): run the `requires_action → aborted` CAS — pinned to `actionId` so a concurrent
   * resolve + re-pause on a fresh action isn't aborted — and, on success, emit the terminal
   * `APPROVAL_EXPIRED_ERROR` so any attached SSE client gets a terminal event instead of a
   * hung stream. Used by the periodic sweeper and by the resume route, which observes a
   * just-expired action when the user submits a decision after the TTL lapsed. Returns true
   * if this call expired the action.
   */
  async expireApproval(streamId: string, actionId?: string): Promise<boolean> {
    /** Steers accepted before the pause are frozen for its whole window
     *  (enqueue rejects while `requires_action`), so this pre-CAS snapshot is
     *  exactly what the expiry's terminal cleanup is about to delete. Read it
     *  BEFORE the transition — the store drops the queue key inside it — and
     *  park only if the CAS wins (a lost CAS means the run resumed and the
     *  live queue must stay untouched). */
    let parkableSteers: TPendingSteer[] = [];
    let steerOwner: SteerOwner | undefined;
    try {
      const job = await this.jobStore.getJob(streamId);
      if (job) {
        steerOwner = { userId: job.userId, tenantId: job.tenantId };
        parkableSteers = (await this.jobStore.peekSteers(streamId)).map(toPendingSteer);
      }
    } catch (err) {
      logger.warn(`[GenerationJobManager] Failed to snapshot steers pre-expiry ${streamId}`, err);
    }
    const expired = await this._approvals.expire(streamId, actionId);
    if (!expired) {
      return false;
    }
    if (steerOwner && parkableSteers.length > 0) {
      await this.steering.park(streamId, parkableSteers, steerOwner);
    }
    try {
      await this.emitError(streamId, APPROVAL_EXPIRED_ERROR);
    } catch (err) {
      logger.error(`[GenerationJobManager] Failed to notify expired approval ${streamId}`, err);
    }
    await this.runApprovalExpiredHandler(streamId);
    this.runningJobs.delete(streamId);
    return true;
  }

  /**
   * Invoke the host approval-expired cleanup, passing the job so the host can resolve
   * tenant/user-scoped config (the expiry runs outside any request context). Best-effort:
   * the job read and the handler itself may fail without breaking the expiry.
   */
  private async runApprovalExpiredHandler(
    streamId: string,
    job?: SerializableJobData | null,
  ): Promise<void> {
    if (!this._onApprovalExpired) {
      return;
    }
    // Dedup across the expiry paths: a locally expired approval (expireApproval) stays in
    // the store/runtime for the completed-job TTL, so later sweeps re-enter the relay
    // branch for the same aborted approval — run the cleanup once per runtime lifetime.
    const runtime = this.runtimeState.get(streamId);
    if (runtime?.approvalCleanupRan) {
      return;
    }
    if (runtime) {
      runtime.approvalCleanupRan = true;
    }
    let resolvedJob = job;
    if (resolvedJob === undefined) {
      try {
        resolvedJob = await this.jobStore.getJob(streamId);
      } catch {
        resolvedJob = null;
      }
    }
    try {
      await this._onApprovalExpired(streamId, resolvedJob);
    } catch (err) {
      logger.warn(`[GenerationJobManager] Approval-expired cleanup failed for ${streamId}`, err);
    }
  }

  private async expireStaleApprovals(): Promise<void> {
    let changed = false;
    for (const streamId of this.runtimeState.keys()) {
      let job: SerializableJobData | null;
      try {
        job = await this.jobStore.getJob(streamId);
      } catch (err) {
        logger.error(
          `[GenerationJobManager] Failed to read job during approval expiry sweep: ${streamId}`,
          err,
        );
        continue;
      }
      // Loser-replica relay: in a multi-replica deployment another replica's store
      // cleanup (`cleanupRequiresActionIndex`) can win the requires_action → aborted
      // approval-expiry CAS — it sets the hash error but cannot emit (the store has no
      // event transport). A client subscribed on THIS replica would then never get a
      // terminal event until the reap path. If the job is already aborted *for approval
      // expiry* and we haven't emitted here, relay the terminal error to our subscriber.
      // The `errorEvent` flag (set by emitError) keeps this idempotent vs the win path.
      const runtime = this.runtimeState.get(streamId);
      if (job?.status === 'aborted' && job.error === APPROVAL_EXPIRED_ERROR) {
        if (!runtime?.errorEvent) {
          try {
            await this.emitError(streamId, APPROVAL_EXPIRED_ERROR);
          } catch (err) {
            logger.error(
              `[GenerationJobManager] Failed to relay expired approval ${streamId}`,
              err,
            );
          }
        }
        // The winning store cleanup (`cleanupRequiresActionIndex`) transitions status
        // directly and can't run host cleanup — do it on relay. Deliberately NOT gated on
        // `errorEvent`: a reconnect seeds that flag from the aborted job, which must not
        // suppress the (idempotent) prune. The handler dedups per runtime lifetime, which
        // also covers approvals expired LOCALLY via expireApproval.
        await this.runApprovalExpiredHandler(streamId, job);
        changed = this.runningJobs.delete(streamId) || changed;
        continue;
      }
      if (!job || job.status !== 'requires_action' || !isPendingActionExpired(job)) {
        continue;
      }
      // Pass the OBSERVED action id so the expire CAS only fires for the action we read
      // as stale. Between this read and the CAS, the user could resolve it and the run
      // re-pause on a fresh action; without the id, the CAS (status-only) would abort
      // that valid new pause and leave it terminal.
      const didExpire = await this.expireApproval(streamId, job.pendingAction?.actionId);
      if (!didExpire) {
        continue;
      }
      changed = true;
      logger.debug(`[GenerationJobManager] Expired pending approval: ${streamId}`);
    }
    if (changed) {
      this.syncRunningJobMetrics();
    }
  }

  private async cleanup(): Promise<void> {
    // Finalize approvals whose window lapsed before the store's own cleanup, so a
    // client still attached to a paused stream gets a terminal event instead of a
    // connection that hangs open until it gives up.
    await this.expireStaleApprovals();

    const count = await this.jobStore.cleanup();
    let runningJobsChanged = false;

    // Cleanup runtime state for deleted jobs
    for (const streamId of this.runtimeState.keys()) {
      if (!(await this.jobStore.hasJob(streamId))) {
        /**
         * Abort any still-pending generation whose job has been reaped (e.g. a
         * stale "running" job removed by the store's failsafe timeout). This
         * unwinds the hung in-flight work so its client/graph references can be
         * garbage collected, rather than leaking via the pending promise.
         */
        const runtime = this.runtimeState.get(streamId);
        if (runtime && !runtime.abortController.signal.aborted) {
          runtime.abortController.abort();
        }
        // If a client is still attached when the job is reaped, send a terminal
        // error first so the SSE connection closes instead of hanging open with no
        // final/done event (the route only ends the response from onDone/onError).
        if (this.eventTransport.getSubscriberCount(streamId) > 0) {
          try {
            await this.eventTransport.emitError(streamId, REAPED_JOB_ERROR);
          } catch (err) {
            logger.error(`[GenerationJobManager] Failed to notify reaped stream ${streamId}:`, err);
          }
        }
        this.runtimeState.delete(streamId);
        runningJobsChanged = this.runningJobs.delete(streamId) || runningJobsChanged;
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

    if (runningJobsChanged) {
      this.syncRunningJobMetrics();
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

  /** Returns sizes of internal runtime maps for diagnostics */
  getRuntimeStats(): {
    runtimeStateSize: number;
    runStepBufferSize: number;
    eventTransportStreams: number;
  } {
    return {
      runtimeStateSize: this.runtimeState.size,
      runStepBufferSize: this.runStepBuffers?.size ?? 0,
      eventTransportStreams: this.eventTransport.getTrackedStreamIds().length,
    };
  }

  /**
   * Get job count by status.
   */
  async getJobCountByStatus(): Promise<Record<t.GenerationJobStatus, number>> {
    const [running, complete, error, aborted, requires_action] = await Promise.all([
      this.jobStore.getJobCountByStatus('running'),
      this.jobStore.getJobCountByStatus('complete'),
      this.jobStore.getJobCountByStatus('error'),
      this.jobStore.getJobCountByStatus('aborted'),
      this.jobStore.getJobCountByStatus('requires_action'),
    ]);
    return { running, complete, error, aborted, requires_action };
  }

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Performs self-healing cleanup of stale entries.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  async getActiveJobIdsForUser(userId: string, tenantId?: string): Promise<string[]> {
    return this.jobStore.getActiveJobIdsByUser(userId, tenantId);
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
    this.runningJobs.clear();
    this.syncRunningJobMetrics();
    this.runStepBuffers?.clear();
    this.replayEventWriteQueues.clear();
    this.tokenUsageWriteQueues.clear();

    logger.debug('[GenerationJobManager] Destroyed');
  }
}

export const GenerationJobManager: GenerationJobManagerClass = new GenerationJobManagerClass();
export { GenerationJobManagerClass };
