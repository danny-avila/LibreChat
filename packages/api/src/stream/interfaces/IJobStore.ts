import type { Agents, TFile, TPendingSteer } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';

/**
 * Job status enum.
 *
 * `requires_action` is non-terminal: the run has paused for human review
 * (e.g. tool approval) and is expected to be resumed by an approval route.
 * Stores must NOT cleanup `requires_action` jobs as if they were complete.
 */
export type JobStatus = 'running' | 'complete' | 'error' | 'aborted' | 'requires_action';

/**
 * Serializable job data - no object references, suitable for Redis/external storage
 */
export interface SerializableJobData {
  streamId: string;
  userId: string;
  tenantId?: string;
  status: JobStatus;
  createdAt: number;
  completedAt?: number;
  conversationId?: string;
  error?: string;

  /** User message metadata */
  userMessage?: {
    messageId: string;
    parentMessageId?: string;
    conversationId?: string;
    text?: string;
    /** Quoted excerpts referenced on this turn, carried so resumable/aborted
     *  reconstructions of the user message keep their `MessageQuotes`. */
    quotes?: string[];
    /** Skill selections, carried so a HITL-resumed turn's requestMessage keeps its pills. */
    manualSkills?: string[];
    alwaysAppliedSkills?: string[];
    /** Uploaded files for the turn, carried so a HITL resume sources them from the job
     *  rather than a user DB row whose save can still be racing the approval prompt. */
    files?: unknown[];
  };

  /** Response message ID for reconnection */
  responseMessageId?: string;

  /**
   * Deferred-tool names discovered (via `tool_search`) before a HITL pause, captured
   * so a resume can replay them into `createRun` — the rebuilt graph uses `messages: []`
   * (state comes from the checkpoint), so without these the paused deferred tool would be
   * absent from the schema-only toolMap and resume would fail with "unknown tool".
   */
  discoveredTools?: string[];

  /** Whether the user-message created event has been emitted */
  createdEventEmitted?: boolean;

  /** Sender name for UI display */
  sender?: string;

  /** Whether sync has been sent to a client */
  syncSent: boolean;

  /** Serialized final event for replay */
  finalEvent?: string;

  /** Serialized title event for replay during active-stream resume */
  titleEvent?: string;

  /** Serialized replay-only stream events for active-stream resume */
  replayEvents?: string;

  /** Serialized latest context usage snapshot for active-stream resume */
  contextUsage?: string;

  /** Serialized token usage events for active-stream resume (cross-replica safe) */
  tokenUsage?: string;

  /** Endpoint metadata for abort handling - avoids storing functions */
  endpoint?: string;
  iconURL?: string;
  model?: string;
  promptTokens?: number;

  /**
   * Agent that initiated the run. Persisted so a HITL resume can verify it rebuilds
   * the SAME agent that paused — resuming Agent A's checkpoint on Agent B's graph
   * would mis-execute the paused tool calls.
   */
  agent_id?: string;

  /**
   * Whether the originating turn was a temporary (non-persisted) chat. Persisted so
   * a HITL resume keeps the resumed response temporary instead of saving it — the
   * resume request can't be trusted to re-send the flag.
   */
  isTemporary?: boolean;

  /**
   * Set when status is `requires_action`. Describes the human review the
   * run is waiting on. Cleared by the resume path before the job returns to `running`.
   */
  pendingAction?: Agents.PendingAction;

  /**
   * Flat mirror of `pendingAction.actionId`, kept as a top-level field so an
   * atomic status transition can guard on it (a nested JSON field can't be
   * compared inside a Redis Lua CAS). Lets `resolve`/`expire` reject a stale
   * decision that targets a different action than the one currently pending.
   */
  pendingActionId?: string;

  /**
   * Liveness basis for the stale-running failsafe, refreshed when a paused job
   * is resumed. Without it, cleanup keys off `createdAt`, so an approval that
   * sat in `requires_action` past the running window would be reaped on the
   * next tick right after resuming. Falls back to `createdAt` when unset.
   */
  lastActiveAt?: number;

  /**
   * Flat flag set by the terminal close-and-drain (Redis: raw hash field the
   * enqueue Lua guards on; in-memory: a parallel set). Once set, new steers
   * are rejected until `createJob` reuses the stream id. Never written through
   * `updateJob` — listed here so cleanup paths can reference the key name.
   */
  steersClosed?: boolean;
}

/**
 * Whether a job's pending review has passed its `expiresAt`. Shared by the
 * stores so an expired approval is kept out of active-job listings (the client
 * stops polling; cleanup/expiry finalizes it).
 */
export function isPendingActionExpired(job: Pick<SerializableJobData, 'pendingAction'>): boolean {
  const exp = job.pendingAction?.expiresAt;
  return exp != null && exp <= Date.now();
}

/**
 * Whether a `requires_action` job has no live, resolvable prompt — either the
 * pendingAction is missing/malformed (e.g. dropped on deserialize) or past its
 * `expiresAt`. Such a job can't be rendered or resolved, so it must be kept out
 * of active listings and finalized by cleanup rather than left stuck active.
 */
export function isPendingActionStale(job: Pick<SerializableJobData, 'pendingAction'>): boolean {
  return !job.pendingAction || isPendingActionExpired(job);
}

/**
 * A user steering message queued for mid-run injection. Enqueued by the steer
 * route on any instance; drained FIFO by the owning process's run-scoped
 * PostToolBatch hook at the next tool-batch boundary.
 */
export interface SteerQueueItem {
  steerId: string;
  text: string;
  userId: string;
  createdAt: number;
  /** Attachment refs steered with the message. Display metadata only — the
   *  drain re-fetches each file by id scoped to the run's user and encodes
   *  fresh, so nothing here is trusted beyond identifying the file. */
  files?: Partial<TFile>[];
}

/** Maximum steers a single run can have queued at once. */
export const STEER_QUEUE_MAX_DEPTH = 10;

/** `enqueueSteer` rejection: the job is missing or not `running`. */
export const STEER_ENQUEUE_NOT_RUNNING = -1;

/** `enqueueSteer` rejection: the queue is at {@link STEER_QUEUE_MAX_DEPTH}. */
export const STEER_ENQUEUE_QUEUE_FULL = -2;

/**
 * Arguments for an atomic {@link IJobStore.transitionStatus} compare-and-set.
 */
export interface JobStatusTransition {
  /** Only fire the transition if the job is currently in this status. */
  from: JobStatus;
  /** Status to move to when the `from` guard holds. */
  to: JobStatus;
  /** Fields written in the same atomic step as the status change. */
  patch?: Partial<SerializableJobData>;
  /** Field names removed in the same atomic step (e.g. `pendingAction`). */
  clear?: Array<keyof SerializableJobData & string>;
  /**
   * Additional guard: only fire if the job's `pendingActionId` equals this.
   * Checked atomically alongside the `from` status so a stale decision can't
   * resolve a job that has since paused for a different action.
   */
  expectActionId?: string;
}

/** Value stored under an idempotency claim: the stream a retried request should attach to. */
export interface IdempotencyClaimValue {
  streamId: string;
  conversationId: string;
  /** Epoch ms the claim was written — lets a losing duplicate tell a winner that is still
   *  starting (recent, no job yet → retry) from one that already finished and was cleaned
   *  up (old, no job → attach and let the client refetch). */
  claimedAt?: number;
}

/** Result of an atomic {@link IJobStore.claimIdempotencyKey} attempt. */
export interface IdempotencyClaimResult {
  /** True when this caller won the claim and should create the job. */
  claimed: boolean;
  /** When `claimed` is false, the stream the original request is already driving. */
  existing?: IdempotencyClaimValue;
}

/**
 * Usage metadata for token spending across different LLM providers.
 *
 * This interface supports two mutually exclusive cache token formats:
 *
 * **OpenAI format** (GPT-4, o1, etc.):
 * - Uses `input_token_details.cache_creation` and `input_token_details.cache_read`
 * - Cache tokens are nested under the `input_token_details` object
 *
 * **Anthropic format** (Claude models):
 * - Uses `cache_creation_input_tokens` and `cache_read_input_tokens`
 * - Cache tokens are top-level properties
 *
 * When processing usage data, check both formats:
 * ```typescript
 * const cacheCreation = usage.input_token_details?.cache_creation
 *   || usage.cache_creation_input_tokens || 0;
 * ```
 */
export interface UsageMetadata {
  /** Logical usage bucket for accounting/reporting. Defaults to model response usage. */
  usage_type?: 'message' | 'summarization' | 'subagent' | 'sequential';
  /** Total input tokens (prompt tokens) */
  input_tokens?: number;
  /** Total output tokens (completion tokens) */
  output_tokens?: number;
  /** Total billed tokens when provided by the model/runtime */
  total_tokens?: number;
  /** Model identifier that generated this usage */
  model?: string;
  /** Provider identifier that generated this usage */
  provider?: string;
  /** Agent that produced this usage (graph agent id / subagent agent id). Lets
   *  multi-endpoint graphs price each call with its own endpoint token config. */
  agentId?: string;
  /**
   * OpenAI-style cache token details.
   * Present for OpenAI models (GPT-4, o1, etc.)
   */
  input_token_details?: {
    /** Tokens written to cache */
    cache_creation?: number;
    /** Tokens read from cache */
    cache_read?: number;
    /** OpenAI GPT-5.6+ cache-write tokens (billed above the input rate) */
    cache_write_tokens?: number;
  };
  /**
   * Anthropic-style cache creation tokens.
   * Present for Claude models. Mutually exclusive with input_token_details.
   */
  cache_creation_input_tokens?: number;
  /**
   * OpenAI GPT-5.6+ cache-write tokens, reported at the top level of
   * `prompt_tokens_details`/`input_tokens_details`. Distinct from cached
   * (read) tokens and billed at a premium over the input rate.
   */
  cache_write_tokens?: number;
  /**
   * Anthropic-style cache read tokens.
   * Present for Claude models. Mutually exclusive with input_token_details.
   */
  cache_read_input_tokens?: number;
  /**
   * Breakdown of output token counts. Per the LangChain core contract,
   * `output_tokens` is the sum of all output token types — these fields
   * are subsets of `output_tokens`, *not* additional charges.
   */
  output_token_details?: {
    /** Reasoning/thinking tokens generated as chain-of-thought (o1, Gemini thinking, etc.) */
    reasoning?: number;
    audio?: number;
  };
}

/**
 * Result returned from aborting a job - contains all data needed
 * for token spending and message saving without storing callbacks
 */
export interface AbortResult {
  /** Whether the abort was successful */
  success: boolean;
  /** The job data at time of abort */
  jobData: SerializableJobData | null;
  /** Aggregated content from the stream */
  content: Agents.MessageContentComplex[];
  /** Final event to send to client */
  finalEvent: unknown;
  /** Concatenated text from all content parts for token counting fallback */
  text: string;
  /** Collected usage metadata from all models for token spending */
  collectedUsage: UsageMetadata[];
  /** Steers drained at abort time (never injected); surfaced to the client for restore */
  pendingSteers?: TPendingSteer[];
}

/**
 * Resume state for reconnecting clients
 */
export interface ResumeState {
  runSteps: Agents.RunStep[];
  aggregatedContent: Agents.MessageContentComplex[];
  userMessage?: SerializableJobData['userMessage'];
  responseMessageId?: string;
  conversationId?: string;
  sender?: string;
  iconURL?: string;
  model?: string;
  titleEvent?: {
    event: 'title';
    data?: {
      conversationId?: string;
      title?: string;
    };
  };
  replayEvents?: Array<{
    event: string;
    data?: unknown;
    [key: string]: unknown;
  }>;
}

/**
 * Interface for job storage backend.
 * Implementations can use in-memory Map, Redis, KV store, etc.
 *
 * Content state is tied to jobs:
 * - In-memory: Holds WeakRef to graph for live content/run steps access
 * - Redis: Persists chunks, reconstructs content on reconnect
 *
 * This consolidates job metadata + content state into a single interface.
 */
export interface IJobStore {
  /** Initialize the store (e.g., connect to Redis, start cleanup intervals) */
  initialize(): Promise<void>;

  /** Create a new job */
  createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
    tenantId?: string,
  ): Promise<SerializableJobData>;

  /** Get a job by streamId (streamId === conversationId) */
  getJob(streamId: string): Promise<SerializableJobData | null>;

  /** Update job data */
  updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void>;

  /**
   * Atomically transition a job's status, **only if** it is currently `from`.
   * Returns `true` when the transition fired, `false` when the job was missing
   * or no longer in `from` (lost a race / illegal transition).
   *
   * `patch` fields are written and `clear` fields removed in the same atomic
   * step, and the running / requires_action membership sets plus live-key TTLs
   * are reconciled to match `to`. This is the race-safe primitive behind the
   * approval lifecycle — it prevents two concurrent resumes from both driving a
   * paused run (a double-drive would re-execute tools / double-bill).
   *
   * Distinct from {@link updateJob}, which writes status unconditionally for
   * callers that don't know the prior state. Reach for `transitionStatus`
   * whenever the legal prior state is known.
   *
   * Atomicity: fully atomic on in-memory and single-node / sentinel Redis
   * (Lua). On Redis Cluster the status guard is best-effort — the membership
   * sets live on a different hash slot from the job hash — matching the store's
   * existing cluster posture for status writes.
   */
  transitionStatus(streamId: string, args: JobStatusTransition): Promise<boolean>;

  /**
   * Atomically claim an idempotency key so a retried start-generation request
   * attaches to the original stream instead of starting a second billed
   * generation. The first caller gets `{ claimed: true }` and should create the
   * job; a later caller for the same key gets `{ claimed: false, existing }`
   * carrying the stream the original request is already driving.
   *
   * Atomicity: single-key `SET NX` on Redis (one hash slot, cluster-safe) /
   * check-and-set on the single-threaded in-memory store.
   *
   * @param key - Caller-scoped key, e.g. `${userId}:${clientRequestId}`.
   * @param value - The stream a duplicate request should attach to.
   * @param ttlSeconds - Claim lifetime; outlive the generation so a late retry still dedups.
   */
  claimIdempotencyKey(
    key: string,
    value: IdempotencyClaimValue,
    ttlSeconds: number,
  ): Promise<IdempotencyClaimResult>;

  /**
   * Release a previously-claimed idempotency key so the submission can be retried
   * (e.g. the start failed before generation began). No-op if the key is absent.
   */
  releaseIdempotencyKey(key: string): Promise<void>;

  /** Delete a job */
  deleteJob(streamId: string): Promise<void>;

  /** Check if job exists */
  hasJob(streamId: string): Promise<boolean>;

  /** Get all running jobs (for cleanup) */
  getRunningJobs(): Promise<SerializableJobData[]>;

  /** Cleanup expired jobs */
  cleanup(): Promise<number>;

  /**
   * Record generation activity for a job (e.g. a chunk was emitted), refreshing
   * its "last active" timestamp so the stale-running-job failsafe does not reap a
   * stream that is still producing output.
   *
   * In-memory: updates an internal last-activity timestamp used by cleanup().
   * Redis: no-op — the running-job TTL is already refreshed on each appendChunk.
   *
   * @param streamId - The stream identifier
   */
  recordActivity?(streamId: string): void;

  /** Get total job count */
  getJobCount(): Promise<number>;

  /** Get job count by status */
  getJobCountByStatus(status: JobStatus): Promise<number>;

  /** Destroy the store and release resources */
  destroy(): Promise<void>;

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Also performs self-healing cleanup of stale entries.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  getActiveJobIdsByUser(userId: string, tenantId?: string): Promise<string[]>;

  // ===== Content State Methods =====
  // These methods manage volatile content state tied to each job.
  // In-memory: Uses WeakRef to graph for live access
  // Redis: Persists chunks and reconstructs on demand

  /**
   * Set the graph reference for a job (in-memory only).
   * The graph provides live access to contentParts and contentData (run steps).
   *
   * In-memory: Stores WeakRef to graph
   * Redis: No-op (graph not transferable, uses chunks instead)
   *
   * @param streamId - The stream identifier
   * @param graph - The StandardGraph instance
   */
  setGraph(streamId: string, graph: StandardGraph): void;

  /**
   * Set content parts reference for a job.
   *
   * In-memory: Stores direct reference to content array
   * Redis: No-op (content built from chunks)
   *
   * @param streamId - The stream identifier
   * @param contentParts - The content parts array
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void;

  /**
   * Get aggregated content for a job.
   *
   * In-memory: Returns live content from graph.contentParts or stored reference
   * Redis: Reconstructs from stored chunks
   *
   * @param streamId - The stream identifier
   * @returns Content parts or null if not available
   */
  getContentParts(streamId: string): Promise<{
    content: Agents.MessageContentComplex[];
  } | null>;

  /**
   * Get run steps for a job (for resume state).
   *
   * In-memory: Returns live run steps from graph.contentData
   * Redis: Fetches from persistent storage
   *
   * @param streamId - The stream identifier
   * @returns Run steps or empty array
   */
  getRunSteps(streamId: string): Promise<Agents.RunStep[]>;

  /**
   * Append a streaming chunk for later reconstruction.
   *
   * In-memory: No-op (content available via graph reference)
   * Redis: Uses XADD for append-only log efficiency
   *
   * @param streamId - The stream identifier
   * @param event - The SSE event to append
   */
  appendChunk(streamId: string, event: unknown): Promise<void>;

  /**
   * Clear all content state for a job.
   * Called on job completion/cleanup.
   *
   * @param streamId - The stream identifier
   */
  clearContentState(streamId: string): void;

  /**
   * Save run steps to persistent storage.
   * In-memory: No-op (run steps accessed via graph reference)
   * Redis: Persists for resume across instances
   *
   * @param streamId - The stream identifier
   * @param runSteps - Run steps to save
   */
  saveRunSteps?(streamId: string, runSteps: Agents.RunStep[]): Promise<void>;

  /**
   * Set collected usage reference for a job.
   * This array accumulates token usage from all models during generation.
   *
   * @param streamId - The stream identifier
   * @param collectedUsage - Array of usage metadata from all models
   */
  setCollectedUsage(streamId: string, collectedUsage: UsageMetadata[]): void;

  /**
   * Get collected usage for a job.
   *
   * @param streamId - The stream identifier
   * @returns Array of usage metadata or empty array
   */
  getCollectedUsage(streamId: string): UsageMetadata[];

  // ===== Steering Queue Methods =====
  // FIFO queue of mid-run user messages, keyed by streamId. Writable from any
  // instance (the steer route), drained only by the run's owning process.

  /**
   * Atomically append a steer, guarded on the job being `running` AND the
   * queue not being closed by a terminal drain. Returns the new queue depth,
   * {@link STEER_ENQUEUE_NOT_RUNNING} when the job is missing, not running,
   * or closed, or {@link STEER_ENQUEUE_QUEUE_FULL} at max depth.
   */
  enqueueSteer(streamId: string, item: SteerQueueItem): Promise<number>;

  /**
   * Atomically take ALL queued steers, FIFO. Empty array when none. With
   * `expectedCreatedAt`, the drain is refused (atomically, inside the store)
   * when the live job's `createdAt` differs — a stale run's drain must never
   * consume a replacement job's queue.
   */
  drainSteers(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]>;

  /**
   * Atomically CLOSE the queue to new steers, then take all queued items
   * FIFO. Used by the terminal paths (final event, abort) so a steer POST
   * racing finalization can never be 202-ACKed after the last drain and then
   * silently cleared — once closed, `enqueueSteer` rejects until the next
   * `createJob` reopens the stream id. `expectedCreatedAt` guards exactly
   * like {@link drainSteers}: a stale run's finalization can neither close
   * nor steal a replacement job's queue.
   */
  closeAndDrainSteers(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]>;

  /** Non-destructive FIFO read of the queued steers (status/resume surfaces). */
  peekSteers(streamId: string): Promise<SteerQueueItem[]>;

  /** Remove ONE queued steer by id (user-cancelled before injection).
   *  False when it was no longer queued — already drained or run ended. */
  removeSteer(streamId: string, steerId: string): Promise<boolean>;

  /**
   * Persist terminally-drained steers under their OWN bounded-TTL key so a
   * client with no live subscriber can recover them via the status route.
   * Deliberately independent of the job record — the default `completeJob`
   * path deletes the job immediately, and recovery must survive that.
   * Overwrites any prior payload; cleared by `createJob` (a replacement run
   * invalidates recovery — a live client had to start it).
   */
  parkSteers(streamId: string, payload: string): Promise<void>;

  /**
   * Claim-on-read: atomically return AND remove the parked payload, so a
   * second reload cannot re-mint chips the user already dismissed. The
   * removal is gated on `ownerFragment` (an opaque substring of the
   * serialized payload, e.g. `"userId":"u1"`) INSIDE the same atomic step —
   * a non-owner probe returns nothing and leaves the payload untouched
   * instead of deleting it ahead of the owner check. Stores stay
   * schema-free: the caller parses and authorizes the returned payload.
   */
  claimParkedSteers(streamId: string, ownerFragment: string): Promise<string | undefined>;

  /** Drop any queued steers (terminal cleanup backstop). */
  clearSteers(streamId: string): Promise<void>;
}

/**
 * Interface for pub/sub event transport.
 * Implementations can use EventEmitter, Redis Pub/Sub, etc.
 */
export interface IEventTransport {
  /** Subscribe to events for a stream. `ready` resolves once the transport can receive messages. */
  subscribe(
    streamId: string,
    handlers: {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    },
  ): { unsubscribe: () => void; ready?: Promise<void> };

  /** Publish a chunk event - returns Promise in Redis mode for ordered delivery */
  emitChunk(streamId: string, event: unknown): void | Promise<void>;

  /** Publish a done event - returns Promise in Redis mode for ordered delivery */
  emitDone(streamId: string, event: unknown): void | Promise<void>;

  /** Publish an error event - returns Promise in Redis mode for ordered delivery */
  emitError(streamId: string, error: string): void | Promise<void>;

  /**
   * Publish an abort signal to all replicas (Redis mode).
   * Enables cross-replica abort: user aborts on Replica B,
   * generating Replica A receives signal and stops.
   * Optional - only implemented in Redis transport.
   */
  emitAbort?(streamId: string): void;

  /**
   * Register callback for abort signals from any replica (Redis mode).
   * Called when abort is triggered from any replica.
   * Optional - only implemented in Redis transport.
   */
  onAbort?(streamId: string, callback: () => void): void;

  /** Get subscriber count for a stream */
  getSubscriberCount(streamId: string): number;

  /** Check if this is the first subscriber (for ready signaling) */
  isFirstSubscriber(streamId: string): boolean;

  /** Listen for all subscribers leaving */
  onAllSubscribersLeft(streamId: string, callback: () => void): void;

  /**
   * Advance subscriber reorder buffer to match publisher sequence (cross-replica safe).
   * @param earlyReplayCount - Number of events replayed from earlyEventBuffer (same-replica).
   *   Pending entries with seq < earlyReplayCount are duplicates and are pruned; entries at or
   *   above are live chunks that arrived during the async GET window and are preserved.
   *   When 0/undefined (cross-replica), all pending entries are treated as live.
   */
  syncReorderBuffer?(streamId: string, earlyReplayCount?: number): void | Promise<void>;

  /** Cleanup transport resources for a specific stream */
  cleanup(streamId: string): void;

  /** Get all tracked stream IDs (for orphan cleanup) */
  getTrackedStreamIds(): string[];

  /** Destroy all transport resources */
  destroy(): void;
}
