import { logger } from '@librechat/data-schemas';
import { createContentAggregator } from '@librechat/agents';
import type { Agents, TPendingSteer } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type { Redis, Cluster } from 'ioredis';
import type {
  SerializableJobData,
  SteerQueueItem,
  UsageMetadata,
  IJobStore,
  JobStatus,
  JobStatusTransition,
} from '~/stream/interfaces/IJobStore';
import {
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_QUEUE_MAX_DEPTH,
  isPendingActionStale,
} from '~/stream/interfaces/IJobStore';
import { toPendingSteer } from '~/stream/SteeringLifecycle';

/**
 * Atomic compare-and-set on the job hash — the single-winner decision for a
 * status transition. Touches ONLY the job key, which lives on one hash slot, so
 * it is atomic on both single-node and Redis Cluster (cross-slot membership
 * sets are reconciled by the caller AFTER this decides the winner).
 *
 * Guards on the current `status` and, when ARGV[2] is non-empty, on the flat
 * `pendingActionId` field — so a stale decision targeting a different action
 * loses. On success: removes `clear` fields, writes `status`+patch pairs,
 * refreshes the job-hash TTL. Returns 1 if it fired, 0 otherwise.
 *
 *   KEYS: [job]
 *   ARGV: [from, expectActionId | "", ttl, hdelCount, ...hdelFields, ...hsetPairs]
 */
const JOB_CAS_LUA =
  'if redis.call("HGET", KEYS[1], "status") ~= ARGV[1] then return 0 end ' +
  'if ARGV[2] ~= "" and redis.call("HGET", KEYS[1], "pendingActionId") ~= ARGV[2] then return 0 end ' +
  'local ttl = tonumber(ARGV[3]) ' +
  'local hdelCount = tonumber(ARGV[4]) ' +
  'local idx = 5 ' +
  'for i = 1, hdelCount do redis.call("HDEL", KEYS[1], ARGV[idx]) idx = idx + 1 end ' +
  'local hset = {} ' +
  'for i = idx, #ARGV do hset[#hset + 1] = ARGV[i] end ' +
  'if #hset > 0 then redis.call("HSET", KEYS[1], unpack(hset)) end ' +
  'redis.call("EXPIRE", KEYS[1], ttl) ' +
  'return 1';

/**
 * Atomic job (re)creation for the two same-slot keys: reset the steer queue
 * and write the job hash in ONE script. A `/chat/steer` request can then
 * never interleave between the queue reset and the hash write — the enqueue
 * script observes either the old hash (its status guards apply and its list
 * dies with it) or the fully initialized replacement with an empty queue, so
 * a steer accepted against one run can never be drained into another.
 *
 *   KEYS: [job, steers, parkedSteers]
 *   ARGV: [ttl, hdelCount, ...hdelFields, ...hsetPairs]
 */
const JOB_CREATE_LUA =
  'redis.call("DEL", KEYS[2]) ' +
  'redis.call("DEL", KEYS[3]) ' +
  'local ttl = tonumber(ARGV[1]) ' +
  'local hdelCount = tonumber(ARGV[2]) ' +
  'local idx = 3 ' +
  'for i = 1, hdelCount do redis.call("HDEL", KEYS[1], ARGV[idx]) idx = idx + 1 end ' +
  'local hset = {} ' +
  'for i = idx, #ARGV do hset[#hset + 1] = ARGV[i] end ' +
  'redis.call("HSET", KEYS[1], unpack(hset)) ' +
  'redis.call("EXPIRE", KEYS[1], ttl) ' +
  'return 1';

/**
 * XADD a chunk + set the chunk-stream TTL to the right window WITHOUT ever shrinking it.
 *
 * During a live stream the running TTL is refreshed on every chunk. But a job paused
 * for HITL review must keep its chunk stream alive for the whole approval window, not
 * the ~20m running TTL — otherwise the pre-pause aggregated content (tool call + earlier
 * text) is evicted before the user resolves and `getResumeState()` loses it.
 *
 * `transitionStatus` extends the chunk-key TTL to the approval window at pause time, but
 * that alone is not enough:
 *   1. The pause's `EXPIRE chunks` is a no-op if the chunk key does not exist yet — and
 *      `appendChunk` is fire-and-forget, so the first chunk's XADD can land AFTER the
 *      pause, or an ask-user pause can occur before any chunk was ever persisted.
 *   2. The `on_pending_action` chunk (and any chunk that races in after the pause) would
 *      otherwise reset an already-extended TTL back to the short running TTL.
 * So this script derives the target window itself: the running TTL normally, but when the
 * job hash is paused (`status == "requires_action"`) it takes the larger of the running
 * TTL and the job key's own remaining TTL (which `transitionStatus` set to the approval
 * window). It only ever EXTENDS — `cur < target` — so a normally-running stream keeps the
 * round-10 extend-only behavior and is never inflated to the approval window.
 *
 * Reading the paused window from the job key (rather than always max-ing against it) is
 * what keeps a normal running run on the short TTL: TTL(jobKey) is only the long approval
 * window while paused; for a running job the job key carries the running TTL, so target
 * stays `run`.
 *
 *   KEYS: [chunks, job]
 *   ARGV: [eventJson, runningTtl]
 */
const CHUNK_APPEND_LUA =
  'redis.call("XADD", KEYS[1], "*", "event", ARGV[1]) ' +
  'local run = tonumber(ARGV[2]) ' +
  'local target = run ' +
  'if redis.call("HGET", KEYS[2], "status") == "requires_action" then ' +
  'local jt = redis.call("TTL", KEYS[2]) ' +
  'if jt > target then target = jt end ' +
  'end ' +
  'local cur = redis.call("TTL", KEYS[1]) ' +
  'if cur < target then redis.call("EXPIRE", KEYS[1], target) end ' +
  'return 1';

/**
 * Persist the run-step timeline with the same paused-window TTL as the chunk stream.
 * `saveRunSteps` SETs (overwrites) the whole array, so unlike the chunk append there's no
 * prior key TTL worth preserving — but the write must still extend to the APPROVAL window
 * when the job is paused (`status == "requires_action"`). Otherwise a run-step save that
 * lands at/after a fast pause resets the key to the short running TTL, and a reload of a
 * still-live approval after that window loses the tool/run-step timeline even though the
 * approval remains resumable. Reads the paused window from the job key (which
 * `transitionStatus` set); a normally-running job keeps the short running TTL.
 *
 *   KEYS: [runSteps, job]
 *   ARGV: [runStepsJson, runningTtl]
 */
const RUNSTEPS_SAVE_LUA =
  'redis.call("SET", KEYS[1], ARGV[1]) ' +
  'local run = tonumber(ARGV[2]) ' +
  'local target = run ' +
  'if redis.call("HGET", KEYS[2], "status") == "requires_action" then ' +
  'local jt = redis.call("TTL", KEYS[2]) ' +
  'if jt > target then target = jt end ' +
  'end ' +
  'redis.call("EXPIRE", KEYS[1], target) ' +
  'return 1';

/**
 * Atomically append a steer, guarded on the job hash still being `running`
 * AND the queue not being closed by a terminal drain (`steersClosed` field,
 * set by {@link STEER_CLOSE_DRAIN_LUA}, cleared on createJob). Both keys share
 * the {streamId} hash tag (single slot), so the script is atomic on cluster
 * too — a steer can never land on a completed/aborted/finalizing job, and the
 * depth cap can't be raced past by concurrent enqueues.
 *
 *   KEYS: [job, steers]
 *   ARGV: [itemJson, ttl, maxDepth]
 *   Returns: new depth, -1 (not running / closed), or -2 (queue full)
 */
const STEER_ENQUEUE_LUA =
  'if redis.call("HGET", KEYS[1], "status") ~= "running" then return -1 end ' +
  'if redis.call("HGET", KEYS[1], "steersClosed") == "1" then return -1 end ' +
  'if redis.call("LLEN", KEYS[2]) >= tonumber(ARGV[3]) then return -2 end ' +
  'redis.call("RPUSH", KEYS[2], ARGV[1]) ' +
  'redis.call("EXPIRE", KEYS[2], tonumber(ARGV[2])) ' +
  'return redis.call("LLEN", KEYS[2])';

/**
 * Atomic take-all: read the whole queue FIFO and delete the key in one step,
 * so two concurrent drains can never both deliver the same steer. When an
 * expected `createdAt` is supplied, the drain is additionally guarded against
 * job replacement INSIDE the script — a stale run's hook can never consume a
 * replacement job's queue (the check-then-drain would otherwise race
 * `createJob`).
 *
 *   KEYS: [job, steers]
 *   ARGV: [expectedCreatedAt or ""]
 *   Returns: array of item JSON strings (possibly empty)
 */
const STEER_DRAIN_LUA =
  'if ARGV[1] ~= "" and redis.call("HGET", KEYS[1], "createdAt") ~= ARGV[1] then return {} end ' +
  'local items = redis.call("LRANGE", KEYS[2], 0, -1) ' +
  'redis.call("DEL", KEYS[2]) ' +
  'return items';

/**
 * Remove ONE queued steer by id without disturbing the rest: the list is
 * rebuilt atomically, so a concurrent drain either delivers the steer or the
 * cancel wins — never a torn queue. ARGV[1] is the JSON fragment
 * `"steerId":"<id>"` matched as a plain substring against each serialized
 * item (ids are server-generated UUIDs, no escaping ambiguity). The list TTL
 * survives the rebuild.
 *
 *   KEYS: [steers]
 *   ARGV: [steerIdFragment]
 *   Returns: 1 when removed, 0 when not found
 */
const STEER_REMOVE_LUA =
  'local items = redis.call("LRANGE", KEYS[1], 0, -1) ' +
  'if #items == 0 then return 0 end ' +
  'local kept = {} ' +
  'local removed = 0 ' +
  'for i = 1, #items do ' +
  'if removed == 0 and string.find(items[i], ARGV[1], 1, true) then removed = 1 ' +
  'else kept[#kept + 1] = items[i] end ' +
  'end ' +
  'if removed == 0 then return 0 end ' +
  'local ttl = redis.call("PTTL", KEYS[1]) ' +
  'redis.call("DEL", KEYS[1]) ' +
  'if #kept > 0 then ' +
  'redis.call("RPUSH", KEYS[1], unpack(kept)) ' +
  'if ttl > 0 then redis.call("PEXPIRE", KEYS[1], ttl) end ' +
  'end ' +
  'return 1';

/**
 * Claim-on-read for parked steers: return AND delete in one atomic step so a
 * second reload cannot re-mint chips the user already dismissed. The owner
 * gate runs INSIDE the same step — a payload not containing the requester's
 * `"userId":"…"` fragment (ARGV[1], plain-substring match) returns the empty
 * sentinel WITHOUT deleting, so a non-owner probe can never destroy the
 * owner's recovery, even transiently. Single key (cluster-safe); GETDEL is
 * avoided only for older-Redis compatibility.
 *
 *   KEYS: [parkedSteers]
 *   ARGV: [ownerFragment]
 *   Returns: the parked payload JSON, '' when not the owner, or nil
 */
const CLAIM_PARKED_LUA =
  'local v = redis.call("GET", KEYS[1]) ' +
  'if not v then return v end ' +
  'if not string.find(v, ARGV[1], 1, true) then return "" end ' +
  'redis.call("DEL", KEYS[1]) ' +
  'return v';

/**
 * Terminal close-then-drain in one atomic step: mark the queue closed on the
 * job hash (only when the hash still exists — a bare HSET would resurrect a
 * deleted job as a stray hash), then take the whole queue. Once closed,
 * {@link STEER_ENQUEUE_LUA} rejects, so a steer POST racing finalization can
 * never be ACKed after the last drain and then silently cleared. The same
 * expected-`createdAt` guard as {@link STEER_DRAIN_LUA} keeps a stale run's
 * finalization from closing (and stealing) a replacement job's queue.
 *
 *   KEYS: [job, steers]
 *   ARGV: [expectedCreatedAt or ""]
 *   Returns: array of item JSON strings (possibly empty)
 */
const STEER_CLOSE_DRAIN_LUA =
  'if ARGV[1] ~= "" and redis.call("HGET", KEYS[1], "createdAt") ~= ARGV[1] then return {} end ' +
  'if redis.call("EXISTS", KEYS[1]) == 1 then redis.call("HSET", KEYS[1], "steersClosed", "1") end ' +
  'local items = redis.call("LRANGE", KEYS[2], 0, -1) ' +
  'redis.call("DEL", KEYS[2]) ' +
  'return items';

/** Decision kinds the SDK can emit, used to sanity-check persisted records. */
const KNOWN_INTERRUPT_TYPES = new Set(['tool_approval', 'ask_user_question']);

/** Recovery window (seconds) for parked steers when `completedTtl` is
 *  configured to 0 — Redis rejects `EX 0`, which would silently kill
 *  park-based recovery. */
const PARKED_RECOVERY_TTL_S: number = 300;

/**
 * Key prefixes for Redis storage.
 * All keys include the streamId for easy cleanup.
 * Note: streamId === conversationId, so no separate mapping needed.
 *
 * IMPORTANT: Uses hash tags {streamId} for Redis Cluster compatibility.
 * All keys for the same stream hash to the same slot, enabling:
 * - Pipeline operations across related keys
 * - Atomic multi-key operations
 */
const KEYS = {
  /** Job metadata: stream:{streamId}:job */
  job: (streamId: string) => `stream:{${streamId}}:job`,
  /** Chunk stream (Redis Streams): stream:{streamId}:chunks */
  chunks: (streamId: string) => `stream:{${streamId}}:chunks`,
  /** Run steps: stream:{streamId}:runsteps */
  runSteps: (streamId: string) => `stream:{${streamId}}:runsteps`,
  /** Pending steer messages (FIFO list): stream:{streamId}:steers */
  steers: (streamId: string) => `stream:{${streamId}}:steers`,
  /** Parked terminally-drained steers (own TTL — must outlive the job hash,
   *  which the default completeJob path deletes immediately) */
  parkedSteers: (streamId: string) => `stream:{${streamId}}:parked`,
  /** Running jobs set for cleanup (global set - single slot) */
  runningJobs: 'stream:running',
  /** Jobs paused for human review (global set - single slot) */
  requiresActionJobs: 'stream:requires_action',
  /** User's active jobs set, tenant-qualified when tenantId is available */
  userJobs: (userId: string, tenantId?: string) =>
    tenantId ? `stream:user:{${tenantId}:${userId}}:jobs` : `stream:user:{${userId}}:jobs`,
};

/**
 * Default TTL values in seconds.
 * Can be overridden via constructor options.
 */
const DEFAULT_TTL = {
  /** TTL for completed jobs (5 minutes) */
  completed: 300,
  /** TTL for running jobs/chunks (20 minutes - failsafe for crashed jobs) */
  running: 1200,
  /** TTL for chunks after completion (0 = delete immediately) */
  chunksAfterComplete: 0,
  /** TTL for run steps after completion (0 = delete immediately) */
  runStepsAfterComplete: 0,
  /** Safety-net TTL for per-user job tracking sets (24 hours). Refreshed on each createJob. */
  userJobsSet: 86400,
  /**
   * Backstop TTL for a job paused for human review (24 hours). A paused job is
   * NOT a hung generation, so it must not inherit the 20-minute running TTL —
   * an approval with no explicit `expiresAt` is "live" per the API contract and
   * would otherwise be evicted mid-window. A pendingAction with a longer
   * `expiresAt` extends beyond this (see pauseTtlSeconds).
   */
  requiresAction: 86400,
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
/**
 * Configuration options for RedisJobStore
 */
export interface RedisJobStoreOptions {
  /** TTL for completed jobs in seconds (default: 300 = 5 minutes) */
  completedTtl?: number;
  /** TTL for running jobs/chunks in seconds (default: 1200 = 20 minutes) */
  runningTtl?: number;
  /** TTL for chunks after completion in seconds (default: 0 = delete immediately) */
  chunksAfterCompleteTtl?: number;
  /** TTL for run steps after completion in seconds (default: 0 = delete immediately) */
  runStepsAfterCompleteTtl?: number;
  /** TTL for per-user job tracking sets in seconds (default: 86400 = 24 hours). 0 = no TTL. */
  userJobsSetTtl?: number;
  /** Backstop TTL for a paused (requires_action) job in seconds (default: 86400 = 24 hours). */
  requiresActionTtl?: number;
}

export class RedisJobStore implements IJobStore {
  private redis: Redis | Cluster;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private ttl: typeof DEFAULT_TTL;

  /** Whether Redis client is in cluster mode (affects pipeline usage) */
  private isCluster: boolean;

  /**
   * Local cache for graph references on THIS instance.
   * Enables fast reconnects when client returns to the same server.
   * Uses WeakRef to allow garbage collection when graph is no longer needed.
   */
  private localGraphCache = new Map<string, WeakRef<StandardGraph>>();

  /**
   * Local cache for collectedUsage arrays.
   * Generation happens on a single instance, so collectedUsage is only available locally.
   * For cross-replica abort, the abort handler falls back to text-based token counting.
   */
  private localCollectedUsageCache = new Map<string, UsageMetadata[]>();
  /** Same-instance HOST content view (includes host-authored parts like
   *  steers, which the SDK graph never sees). Preferred over the graph cache
   *  on local reads; cross-instance reads reconstruct from chunks. */
  private localContentParts = new Map<string, WeakRef<Agents.MessageContentComplex[]>>();

  /** Cleanup interval in ms (1 minute) */
  private cleanupIntervalMs = 60000;

  constructor(redis: Redis | Cluster, options?: RedisJobStoreOptions) {
    this.redis = redis;
    this.ttl = {
      completed: options?.completedTtl ?? DEFAULT_TTL.completed,
      running: options?.runningTtl ?? DEFAULT_TTL.running,
      chunksAfterComplete: options?.chunksAfterCompleteTtl ?? DEFAULT_TTL.chunksAfterComplete,
      runStepsAfterComplete: options?.runStepsAfterCompleteTtl ?? DEFAULT_TTL.runStepsAfterComplete,
      userJobsSet: options?.userJobsSetTtl ?? DEFAULT_TTL.userJobsSet,
      requiresAction: options?.requiresActionTtl ?? DEFAULT_TTL.requiresAction,
    };
    // Detect cluster mode using ioredis's isCluster property
    this.isCluster = (redis as Cluster).isCluster === true;
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
    tenantId?: string,
  ): Promise<SerializableJobData> {
    const job: SerializableJobData = {
      streamId,
      userId,
      ...(tenantId && { tenantId }),
      status: 'running',
      createdAt: Date.now(),
      conversationId,
      syncSent: false,
    };

    const key = KEYS.job(streamId);
    const userJobsKey = KEYS.userJobs(userId, tenantId);

    // A reused streamId overlays onto any existing hash, so per-turn fields from a
    // prior generation could survive. Drop the HITL fields so the fresh running job
    // never exposes stale approval metadata and cleanup keys off the new createdAt
    // rather than a leftover lastActiveAt. `agent_id` is included because
    // updateMetadata only writes it when truthy — without clearing it here, a
    // conversation that switches from a saved agent to an ephemeral/no-agent turn
    // would keep the old agent_id and the resume guard would reject the valid pause.
    const staleHitlFields: Array<keyof SerializableJobData> = [
      'pendingAction',
      'pendingActionId',
      'lastActiveAt',
      'agent_id',
      // Same reasoning as agent_id: updateMetadata only writes isTemporary when the new
      // metadata carries it, so a prior temporary turn's isTemporary=1 would otherwise
      // survive and a later non-temporary resume would save its response as temporary.
      'isTemporary',
      // Same reasoning again: handleRunInterrupt only writes discoveredTools when THIS
      // turn discovered ≥1 deferred tool, so a replacement turn that later pauses without
      // its own discovery would otherwise inherit the prior run's tool names and force-load
      // deferred tools it never discovered on resume.
      'discoveredTools',
      // A replacement must start with an open steer channel — the closed flag
      // belongs to the finalized run this hash is being reused from.
      'steersClosed',
    ];

    // For cluster mode, we can't pipeline keys on different slots
    // The job key uses hash tag {streamId}, runningJobs and userJobs are on different slots
    // Steer-queue reset + job-hash write happen ATOMICALLY (same-slot Lua):
    // a steer POST can never land between them, so a replacement can neither
    // inherit the replaced run's undrained steers nor lose/steal a steer
    // 202-accepted against either run (see JOB_CREATE_LUA).
    const hsetPairs = Object.entries(this.serializeJob(job)).flat();
    await this.redis.eval(
      JOB_CREATE_LUA,
      3,
      key,
      KEYS.steers(streamId),
      KEYS.parkedSteers(streamId),
      String(this.ttl.running),
      String(staleHitlFields.length),
      ...staleHitlFields,
      ...hsetPairs,
    );
    // Set-membership bookkeeping lives on other slots; ordering after the
    // atomic hash write is safe (scanners tolerate momentary lag).
    if (this.isCluster) {
      await this.redis.sadd(KEYS.runningJobs, streamId);
      await this.redis.srem(KEYS.requiresActionJobs, streamId);
      await this.redis.sadd(userJobsKey, streamId);
      if (this.ttl.userJobsSet > 0) {
        await this.redis.expire(userJobsKey, this.ttl.userJobsSet);
      }
    } else {
      const pipeline = this.redis.pipeline();
      pipeline.sadd(KEYS.runningJobs, streamId);
      pipeline.srem(KEYS.requiresActionJobs, streamId);
      pipeline.sadd(userJobsKey, streamId);
      if (this.ttl.userJobsSet > 0) {
        pipeline.expire(userJobsKey, this.ttl.userJobsSet);
      }
      await pipeline.exec();
    }

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

    // Plain field writer. The membership-aware status transitions
    // (running ⇄ requires_action — sets, TTLs, the actionId guard) go solely
    // through transitionStatus, the single race-safe path. updateJob still
    // handles terminal status writes (complete/error/aborted) + their cleanup.
    const serialized = this.serializeJob(updates as SerializableJobData);
    if (Object.keys(serialized).length === 0) {
      return;
    }

    const fields = Object.entries(serialized).flat();
    const updated = await this.updateExistingJobHash(key, fields);
    if (!updated) {
      return;
    }

    if (updates.status && ['complete', 'error', 'aborted'].includes(updates.status)) {
      await this.applyTerminalContentCleanup(streamId);
    }
  }

  /**
   * Terminal cleanup shared by `updateJob` (complete/error/aborted) and the
   * terminal path of `transitionStatus` (approval expiry → aborted): drop the
   * job from both membership sets and the user-active set, shorten the job-hash
   * TTL to the completed window, and del/shorten the chunk + run-step keys per
   * the configured after-complete TTLs. Without sharing this, an expired
   * approval left Redis stream contents around for the full running TTL.
   */
  private async applyTerminalContentCleanup(streamId: string): Promise<void> {
    const key = KEYS.job(streamId);
    // Proactively remove from user's job set (requires reading userId from the job hash)
    const job = await this.getJob(streamId);
    const userJobsKey = job?.userId ? KEYS.userJobs(job.userId, job.tenantId) : null;

    if (this.isCluster) {
      await this.redis.expire(key, this.ttl.completed);
      await this.redis.srem(KEYS.runningJobs, streamId);
      await this.redis.srem(KEYS.requiresActionJobs, streamId);
      await this.redis.del(KEYS.steers(streamId));

      if (this.ttl.chunksAfterComplete === 0) {
        await this.redis.del(KEYS.chunks(streamId));
      } else {
        await this.redis.expire(KEYS.chunks(streamId), this.ttl.chunksAfterComplete);
      }

      if (this.ttl.runStepsAfterComplete === 0) {
        await this.redis.del(KEYS.runSteps(streamId));
      } else {
        await this.redis.expire(KEYS.runSteps(streamId), this.ttl.runStepsAfterComplete);
      }

      if (userJobsKey) {
        await this.redis.srem(userJobsKey, streamId);
      }
    } else {
      const pipeline = this.redis.pipeline();
      pipeline.expire(key, this.ttl.completed);
      pipeline.srem(KEYS.runningJobs, streamId);
      pipeline.srem(KEYS.requiresActionJobs, streamId);
      pipeline.del(KEYS.steers(streamId));

      if (this.ttl.chunksAfterComplete === 0) {
        pipeline.del(KEYS.chunks(streamId));
      } else {
        pipeline.expire(KEYS.chunks(streamId), this.ttl.chunksAfterComplete);
      }

      if (this.ttl.runStepsAfterComplete === 0) {
        pipeline.del(KEYS.runSteps(streamId));
      } else {
        pipeline.expire(KEYS.runSteps(streamId), this.ttl.runStepsAfterComplete);
      }

      if (userJobsKey) {
        pipeline.srem(userJobsKey, streamId);
      }

      await pipeline.exec();
    }
  }

  /**
   * Live-key TTL (seconds) for a paused job. A paused job isn't a hung
   * generation, so it uses the longer requires_action backstop rather than the
   * running TTL — otherwise a no-expiry approval (the buildPendingAction
   * default), which the API treats as "live", would be evicted after the 20m
   * running window. A pendingAction with an `expiresAt` farther out than the
   * backstop extends to cover it, plus a grace margin so a decision arriving
   * right at the deadline can still resume.
   */
  private pauseTtlSeconds(pendingAction?: Agents.PendingAction): number {
    const exp = pendingAction?.expiresAt;
    if (exp == null) {
      return this.ttl.requiresAction;
    }
    const secondsUntilExpiry = Math.ceil((exp - Date.now()) / 1000) + 60;
    return Math.max(this.ttl.requiresAction, secondsUntilExpiry);
  }

  /** The membership set a status belongs to; terminal statuses have none. */
  private statusSetKey(status: JobStatus): string | null {
    if (status === 'running') {
      return KEYS.runningJobs;
    }
    if (status === 'requires_action') {
      return KEYS.requiresActionJobs;
    }
    return null;
  }

  async transitionStatus(streamId: string, args: JobStatusTransition): Promise<boolean> {
    const { from, to, patch, clear, expectActionId } = args;
    const key = KEYS.job(streamId);

    // status + patch become HSET pairs; serializeJob skips undefined, so
    // cleared fields go through HDEL (`clear`) instead.
    const fields = Object.entries(
      this.serializeJob({ status: to, ...(patch ?? {}) } as SerializableJobData),
    ).flat();
    const clearFields = (clear ?? []).map(String);

    const remSet = this.statusSetKey(from);
    const addSet = this.statusSetKey(to);
    const terminal = addSet === null;
    let ttl = terminal ? this.ttl.completed : this.ttl.running;
    if (to === 'requires_action') {
      // A paused job must outlive its approval window, even when that window is
      // longer than the running TTL — otherwise Redis evicts it before a
      // decision can resume it.
      ttl = this.pauseTtlSeconds(patch?.pendingAction);
    }

    // 1) Single-winner decision: an atomic CAS on the single-slot job hash.
    //    Works identically on cluster and single-node, so two concurrent
    //    resolves can never both win (and drive the run twice).
    const won = await this.redis.eval(
      JOB_CAS_LUA,
      1,
      key,
      from,
      expectActionId ?? '',
      String(ttl),
      String(clearFields.length),
      ...clearFields,
      ...fields,
    );
    if (won !== 1) {
      return false;
    }

    // 2) Reconcile derived state. Only the winner reaches here; membership is
    //    self-healed by periodic cleanup, so this non-atomic cross-slot step is
    //    safe. A terminal target (e.g. approval expiry → aborted) gets the same
    //    content cleanup as updateJob's terminal path.
    if (terminal) {
      await this.applyTerminalContentCleanup(streamId);
      return true;
    }
    if (this.isCluster) {
      if (remSet) {
        await this.redis.srem(remSet, streamId);
      }
      if (addSet) {
        await this.redis.sadd(addSet, streamId);
      }
      await this.redis.expire(KEYS.chunks(streamId), ttl);
      await this.redis.expire(KEYS.runSteps(streamId), ttl);
      // Steers queued before a pause must survive the whole approval window
      // (they inject at the first tool boundary after resume). EXPIRE on a
      // missing key is a no-op.
      await this.redis.expire(KEYS.steers(streamId), ttl);
    } else {
      const pipeline = this.redis.pipeline();
      if (remSet) {
        pipeline.srem(remSet, streamId);
      }
      if (addSet) {
        pipeline.sadd(addSet, streamId);
      }
      pipeline.expire(KEYS.chunks(streamId), ttl);
      pipeline.expire(KEYS.runSteps(streamId), ttl);
      pipeline.expire(KEYS.steers(streamId), ttl);
      await pipeline.exec();
    }
    return true;
  }

  private async updateExistingJobHash(key: string, fields: string[]): Promise<boolean> {
    const updated = await this.redis.eval(
      'if redis.call("EXISTS", KEYS[1]) == 1 then redis.call("HSET", KEYS[1], unpack(ARGV)) return 1 else return 0 end',
      1,
      key,
      ...fields,
    );
    return updated === 1;
  }

  async deleteJob(streamId: string): Promise<void> {
    this.localGraphCache.delete(streamId);
    this.localContentParts.delete(streamId);
    this.localCollectedUsageCache.delete(streamId);
    const job = await this.getJob(streamId);
    const userJobsKey = job?.userId ? KEYS.userJobs(job.userId, job.tenantId) : null;
    return this.deleteJobInternal(streamId, userJobsKey);
  }

  private async deleteJobInternal(streamId: string, userJobsKey: string | null): Promise<void> {
    this.localGraphCache.delete(streamId);
    this.localContentParts.delete(streamId);
    this.localCollectedUsageCache.delete(streamId);

    if (this.isCluster) {
      const pipeline = this.redis.pipeline();
      pipeline.del(KEYS.job(streamId));
      pipeline.del(KEYS.chunks(streamId));
      pipeline.del(KEYS.runSteps(streamId));
      pipeline.del(KEYS.steers(streamId));
      await pipeline.exec();
      await this.redis.srem(KEYS.runningJobs, streamId);
      await this.redis.srem(KEYS.requiresActionJobs, streamId);
      if (userJobsKey) {
        await this.redis.srem(userJobsKey, streamId);
      }
    } else {
      const pipeline = this.redis.pipeline();
      pipeline.del(KEYS.job(streamId));
      pipeline.del(KEYS.chunks(streamId));
      pipeline.del(KEYS.runSteps(streamId));
      pipeline.del(KEYS.steers(streamId));
      pipeline.srem(KEYS.runningJobs, streamId);
      pipeline.srem(KEYS.requiresActionJobs, streamId);
      if (userJobsKey) {
        pipeline.srem(userJobsKey, streamId);
      }
      await pipeline.exec();
    }
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

    // Clean up stale local graph cache entries (WeakRefs that were collected)
    for (const [streamId, graphRef] of this.localGraphCache) {
      if (!graphRef.deref()) {
        this.localGraphCache.delete(streamId);
      }
    }

    // Process in batches of 50 to avoid sequential per-job round-trips
    const BATCH_SIZE = 50;
    for (let i = 0; i < streamIds.length; i += BATCH_SIZE) {
      const batch = streamIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (streamId) => {
          const job = await this.getJob(streamId);

          // Job no longer exists (TTL expired) - remove from set
          if (!job) {
            await this.redis.srem(KEYS.runningJobs, streamId);
            await this.redis.srem(KEYS.requiresActionJobs, streamId);
            this.localGraphCache.delete(streamId);
            this.localContentParts.delete(streamId);
            this.localCollectedUsageCache.delete(streamId);
            return 1;
          }

          if (job.status === 'requires_action') {
            await this.redis.srem(KEYS.runningJobs, streamId);
            await this.redis.sadd(KEYS.requiresActionJobs, streamId);
            this.localGraphCache.delete(streamId);
            this.localContentParts.delete(streamId);
            this.localCollectedUsageCache.delete(streamId);
            return 1;
          }

          // Job completed but still in running set (shouldn't happen, but handle it)
          // Only remove from tracking sets — do NOT delete the job hash, which has
          // its own completedTtl so clients can still poll for final status.
          if (job.status !== 'running') {
            await this.redis.srem(KEYS.runningJobs, streamId);
            await this.redis.srem(KEYS.requiresActionJobs, streamId);
            if (job.userId) {
              await this.redis.srem(KEYS.userJobs(job.userId, job.tenantId), streamId);
            }
            this.localGraphCache.delete(streamId);
            this.localContentParts.delete(streamId);
            this.localCollectedUsageCache.delete(streamId);
            return 1;
          }

          // Stale running job (failsafe - running for > configured TTL).
          // Keys off `lastActiveAt` when present so a just-resumed approval
          // isn't reaped on the basis of its original creation time.
          const liveSince = job.lastActiveAt ?? job.createdAt;
          if (now - liveSince > this.ttl.running * 1000) {
            logger.warn(`[RedisJobStore] Cleaning up stale job: ${streamId}`);
            // A crashed/hung run never reached a finalization drain — park the
            // 202-accepted queue before the delete drops it, so the owner can
            // still recover the words via /chat/status.
            await this.parkSteerSnapshot(
              streamId,
              job,
              await this.snapshotParkableSteers(streamId),
            );
            const userJobsKey = job.userId ? KEYS.userJobs(job.userId, job.tenantId) : null;
            await this.deleteJobInternal(streamId, userJobsKey);
            return 1;
          }

          return 0;
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          cleaned += result.value;
        } else {
          logger.warn(`[RedisJobStore] Cleanup failed for a job:`, result.reason);
        }
      }
    }

    cleaned += await this.cleanupRequiresActionIndex();

    if (cleaned > 0) {
      logger.debug(`[RedisJobStore] Cleaned up ${cleaned} jobs`);
    }

    return cleaned;
  }

  private async cleanupRequiresActionIndex(): Promise<number> {
    const streamIds = await this.redis.smembers(KEYS.requiresActionJobs);
    let cleaned = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < streamIds.length; i += BATCH_SIZE) {
      const batch = streamIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (streamId) => {
          const job = await this.getJob(streamId);

          if (!job) {
            await this.redis.srem(KEYS.requiresActionJobs, streamId);
            this.localGraphCache.delete(streamId);
            this.localContentParts.delete(streamId);
            this.localCollectedUsageCache.delete(streamId);
            return 1;
          }

          if (job.status !== 'requires_action') {
            await this.redis.srem(KEYS.requiresActionJobs, streamId);
            if (job.status === 'running') {
              await this.redis.sadd(KEYS.runningJobs, streamId);
            }
            return 1;
          }

          // Stale approval (expired, or missing/malformed pendingAction):
          // finalize it (aborted) so it stops occupying the slot and its stream
          // contents are reclaimed, mirroring ApprovalLifecycle.expire().
          // transitionStatus runs the terminal content cleanup (sets, chunks,
          // run-steps, userJobs, completed TTL).
          if (isPendingActionStale(job)) {
            // Snapshot 202-accepted steers BEFORE the terminal cleanup DELs the
            // queue key; enqueue is frozen while paused, so this is exact.
            // Parked only if the CAS wins — a lost CAS means the run resumed
            // and the live queue must stay untouched.
            const parkableSteers = await this.snapshotParkableSteers(streamId);
            const expired = await this.transitionStatus(streamId, {
              from: 'requires_action',
              to: 'aborted',
              clear: ['pendingAction', 'pendingActionId'],
              patch: {
                error: 'Approval expired before a decision was made',
                completedAt: Date.now(),
              },
              // Scope the CAS to the action we observed as stale: if the user resolved it
              // and the run re-paused on a fresh action between the read and here, the
              // pendingActionId no longer matches and this no-ops instead of aborting the
              // valid new pause. (Undefined for a missing/malformed pendingAction — nothing
              // to protect — so it falls back to the status-only check.)
              expectActionId: job.pendingAction?.actionId,
            });
            if (expired) {
              await this.parkSteerSnapshot(streamId, job, parkableSteers);
            }
            return 1;
          }

          return 0;
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          cleaned += result.value;
        } else {
          logger.warn(`[RedisJobStore] requires_action cleanup failed for a job:`, result.reason);
        }
      }
    }

    return cleaned;
  }

  async getJobCount(): Promise<number> {
    const [runningCount, requiresActionCount] = await Promise.all([
      this.redis.scard(KEYS.runningJobs),
      this.countJobsInStatusSet(KEYS.requiresActionJobs, 'requires_action'),
    ]);
    return runningCount + requiresActionCount;
  }

  async getJobCountByStatus(status: JobStatus): Promise<number> {
    if (status === 'running') {
      return this.redis.scard(KEYS.runningJobs);
    }

    if (status === 'requires_action') {
      return this.countJobsInStatusSet(KEYS.requiresActionJobs, status);
    }

    return 0;
  }

  private async countJobsInStatusSet(setKey: string, status: JobStatus): Promise<number> {
    const streamIds = await this.redis.smembers(setKey);
    if (streamIds.length === 0) {
      return 0;
    }

    let count = 0;
    const staleIds: string[] = [];
    for (const streamId of streamIds) {
      const job = await this.getJob(streamId);
      if (job?.status === status) {
        count++;
      } else {
        staleIds.push(streamId);
      }
    }

    if (staleIds.length > 0) {
      await this.redis.srem(setKey, ...staleIds);
    }

    return count;
  }

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Also performs self-healing cleanup: removes stale entries for jobs that no longer exist.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  async getActiveJobIdsByUser(userId: string, tenantId?: string): Promise<string[]> {
    const userJobsKey = KEYS.userJobs(userId, tenantId);
    const trackedIds = await this.redis.smembers(userJobsKey);

    if (trackedIds.length === 0) {
      return [];
    }

    const activeIds: string[] = [];
    const staleIds: string[] = [];

    for (const streamId of trackedIds) {
      const job = await this.getJob(streamId);
      // Include running jobs and jobs paused for human review (e.g. tool approval).
      // A pending-approval job still occupies the user's conversation slot — but
      // only while its prompt is live: a past-`expiresAt` approval no longer
      // counts as active (cleanup/expiry will finalize it), so the client stops
      // polling and can complete.
      if (job && (job.status === 'running' || job.status === 'requires_action')) {
        if (job.status === 'requires_action' && isPendingActionStale(job)) {
          continue;
        }
        activeIds.push(streamId);
      } else {
        // Self-healing: job completed/deleted but mapping wasn't cleaned - mark for removal
        staleIds.push(streamId);
      }
    }

    if (staleIds.length > 0) {
      await this.redis.srem(userJobsKey, ...staleIds);
      logger.debug(
        `[RedisJobStore] Self-healed ${staleIds.length} stale job entries for user ${userId}`,
      );
    }

    return activeIds;
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear local caches
    this.localGraphCache.clear();
    this.localCollectedUsageCache.clear();
    // Don't close the Redis connection - it's shared
    logger.info('[RedisJobStore] Destroyed');
  }

  // ===== Content State Methods =====
  // For Redis, content is primarily reconstructed from chunks.
  // However, we keep a LOCAL graph cache for fast same-instance reconnects.

  /**
   * Store graph reference in local cache.
   * This enables fast reconnects when client returns to the same instance.
   * Falls back to Redis chunk reconstruction for cross-instance reconnects.
   *
   * @param streamId - The stream identifier
   * @param graph - The graph instance (stored as WeakRef)
   */
  setGraph(streamId: string, graph: StandardGraph): void {
    this.localGraphCache.set(streamId, new WeakRef(graph));
  }

  /** Splice-inserts host-authored steer parts (from `on_steer_applied`
   *  chunks) into an SDK-graph content view, ascending by recorded index so
   *  each host-view position lands exactly where live clients saw it. */
  private async overlayHostSteerParts(
    streamId: string,
    parts: Agents.MessageContentComplex[],
  ): Promise<Agents.MessageContentComplex[]> {
    const chunks = await this.getChunks(streamId);
    if (chunks.length === 0) {
      return parts;
    }
    const steers: Array<{ index: number; part: Agents.MessageContentComplex }> = [];
    for (const chunk of chunks) {
      const event = chunk as { event?: string; data?: unknown };
      if (event.event !== 'on_steer_applied') {
        continue;
      }
      const steerData = event.data as { index?: number; part?: Agents.MessageContentComplex };
      if (typeof steerData.index === 'number' && steerData.part != null) {
        steers.push({ index: steerData.index, part: steerData.part });
      }
    }
    if (steers.length === 0) {
      return parts;
    }
    steers.sort((a, b) => a.index - b.index);
    const merged = [...parts];
    for (const steer of steers) {
      merged.splice(Math.min(steer.index, merged.length), 0, steer.part);
    }
    return merged;
  }

  /**
   * Cache the HOST-authored content array (WeakRef; owned by the run closure).
   * This is the authoritative same-instance view: host-only parts (steers)
   * live here but never inside the SDK graph, so preferring it over the graph
   * cache keeps same-instance reconnect/abort/status reads steer-complete.
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    this.localContentParts.set(streamId, new WeakRef(contentParts));
  }

  /**
   * Store collectedUsage reference in local cache.
   * This is used for abort handling to spend tokens for all models.
   * Note: Only available on the generating instance; cross-replica abort uses fallback.
   */
  setCollectedUsage(streamId: string, collectedUsage: UsageMetadata[]): void {
    this.localCollectedUsageCache.set(streamId, collectedUsage);
  }

  /**
   * Get collected usage for a job.
   * Only available if this is the generating instance.
   */
  getCollectedUsage(streamId: string): UsageMetadata[] {
    return this.localCollectedUsageCache.get(streamId) ?? [];
  }

  /**
   * Get aggregated content - tries local cache first, falls back to Redis reconstruction.
   *
   * Optimization: If this instance has the live graph (same-instance reconnect),
   * we return the content directly without Redis round-trip.
   * For cross-instance reconnects, we reconstruct from Redis Streams.
   *
   * @param streamId - The stream identifier
   * @returns Content parts array or null if not found
   */
  /**
   * Read from a cached {@link StandardGraph}, tolerating one disposed after a HITL
   * pause. When a paused turn's client is disposed, `disposeClient`
   * (api/server/cleanup.js `graphPropsToClean`) NULLS the graph's internal arrays
   * (`messages`, `contentData`) for GC — but this store still holds a WeakRef to
   * that object. Calling `getContentParts()` (`this.messages.slice()`) or
   * `getRunSteps()` (`[...this.contentData]`) on it then throws
   * ("Cannot read properties of null (reading 'slice')" / "not iterable"), which
   * aborts the resume (#14247). Swallow it, drop the stale entry, and let the
   * caller fall back to durable chunk reconstruction. (The SDK-side null guard in
   * `StandardGraph` is a separate agents fix.)
   */
  private readCachedGraph<T>(
    streamId: string,
    graph: StandardGraph,
    read: (graph: StandardGraph) => T,
  ): T | null {
    try {
      return read(graph);
    } catch (err) {
      logger.debug(
        `[RedisJobStore] Cached graph for ${streamId} is unusable (likely disposed); falling back to reconstruction:`,
        err instanceof Error ? err.message : err,
      );
      this.localGraphCache.delete(streamId);
      return null;
    }
  }

  async getContentParts(streamId: string): Promise<{
    content: Agents.MessageContentComplex[];
  } | null> {
    // 1. Prefer the HOST content array (same-instance fast path): it already
    // contains host-authored steer parts the SDK graph never sees.
    const hostRef = this.localContentParts.get(streamId);
    if (hostRef) {
      const hostParts = hostRef.deref();
      if (hostParts && hostParts.length > 0) {
        return { content: hostParts };
      }
      if (!hostParts) {
        this.localContentParts.delete(streamId);
      }
    }

    // 2. Local graph cache (runs wired before setContentParts): the SDK view
    // lacks host-authored steer parts, so overlay them from the chunk log —
    // insert (not assign): the graph array is UNSHIFTED, while recorded steer
    // indices are host-view positions that already account for prior steers.
    const graphRef = this.localGraphCache.get(streamId);
    if (graphRef) {
      const graph = graphRef.deref();
      if (graph) {
        const localParts = this.readCachedGraph(streamId, graph, (g) => g.getContentParts());
        if (localParts && localParts.length > 0) {
          return {
            content: await this.overlayHostSteerParts(streamId, localParts),
          };
        }
      } else {
        // WeakRef was collected, remove from cache
        this.localGraphCache.delete(streamId);
      }
    }

    // 2. Fall back to Redis chunk reconstruction (cross-instance reconnect)
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
      if (!event.event || !event.data) {
        continue;
      }

      // Steer parts are host-authored (the SDK aggregator doesn't know the
      // event), so splice them at their recorded index — SDK events after the
      // injection were emitted with already-shifted indices, so both sources
      // land disjoint.
      if (event.event === 'on_steer_applied') {
        const steerData = event.data as { index?: number; part?: Agents.MessageContentComplex };
        if (typeof steerData.index === 'number' && steerData.part != null) {
          contentParts[steerData.index] = steerData.part;
        }
        continue;
      }

      if (!validEvents.has(event.event)) {
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

    return {
      content: filtered,
    };
  }

  /**
   * Get run steps - tries local cache first, falls back to Redis.
   *
   * Optimization: If this instance has the live graph, we get run steps
   * directly without Redis round-trip.
   *
   * @param streamId - The stream identifier
   * @returns Run steps array
   */
  async getRunSteps(streamId: string): Promise<Agents.RunStep[]> {
    // 1. Try local graph cache first (fast path for same-instance reconnect)
    const graphRef = this.localGraphCache.get(streamId);
    if (graphRef) {
      const graph = graphRef.deref();
      if (graph) {
        const localSteps = this.readCachedGraph(streamId, graph, (g) => g.getRunSteps());
        if (localSteps && localSteps.length > 0) {
          return localSteps;
        }
      }
      // Note: Don't delete from cache here - graph may still be valid
      // but just not have run steps yet
    }

    // 2. Fall back to Redis (cross-instance reconnect)
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
   * Removes both local cache and Redis data.
   */
  clearContentState(streamId: string): void {
    // Clear local caches immediately
    this.localGraphCache.delete(streamId);
    this.localContentParts.delete(streamId);
    this.localCollectedUsageCache.delete(streamId);

    // Fire and forget - async cleanup for Redis
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

  // ===== Steering Queue Methods =====

  async enqueueSteer(streamId: string, item: SteerQueueItem): Promise<number> {
    const result = await this.redis.eval(
      STEER_ENQUEUE_LUA,
      2,
      KEYS.job(streamId),
      KEYS.steers(streamId),
      JSON.stringify(item),
      String(this.ttl.running),
      String(STEER_QUEUE_MAX_DEPTH),
    );
    if (typeof result !== 'number') {
      return STEER_ENQUEUE_NOT_RUNNING;
    }
    return result;
  }

  async drainSteers(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]> {
    const raw = await this.redis.eval(
      STEER_DRAIN_LUA,
      2,
      KEYS.job(streamId),
      KEYS.steers(streamId),
      expectedCreatedAt != null ? String(expectedCreatedAt) : '',
    );
    return this.parseSteerItems(raw);
  }

  async closeAndDrainSteers(
    streamId: string,
    expectedCreatedAt?: number,
  ): Promise<SteerQueueItem[]> {
    const raw = await this.redis.eval(
      STEER_CLOSE_DRAIN_LUA,
      2,
      KEYS.job(streamId),
      KEYS.steers(streamId),
      expectedCreatedAt != null ? String(expectedCreatedAt) : '',
    );
    return this.parseSteerItems(raw);
  }

  async peekSteers(streamId: string): Promise<SteerQueueItem[]> {
    const raw = await this.redis.lrange(KEYS.steers(streamId), 0, -1);
    return this.parseSteerItems(raw);
  }

  async clearSteers(streamId: string): Promise<void> {
    await this.redis.del(KEYS.steers(streamId));
  }

  async removeSteer(streamId: string, steerId: string): Promise<boolean> {
    const removed = (await this.redis.eval(
      STEER_REMOVE_LUA,
      1,
      KEYS.steers(streamId),
      `"steerId":"${steerId}"`,
    )) as number;
    return removed === 1;
  }

  async parkSteers(streamId: string, payload: string): Promise<void> {
    const ttl = this.ttl.completed > 0 ? this.ttl.completed : PARKED_RECOVERY_TTL_S;
    await this.redis.set(KEYS.parkedSteers(streamId), payload, 'EX', ttl);
  }

  /** Best-effort FIFO snapshot of the queued steers as client projections. */
  private async snapshotParkableSteers(streamId: string): Promise<TPendingSteer[]> {
    try {
      return (await this.peekSteers(streamId)).map(toPendingSteer);
    } catch (err) {
      logger.warn(`[RedisJobStore] Failed to snapshot steers for parking ${streamId}:`, err);
      return [];
    }
  }

  /**
   * Parks an owner-carrying snapshot so /chat/status can recover 202-accepted
   * steers after the job record is gone (approval expiry, stale-running reap).
   * Best-effort: a park failure must not block the cleanup path that called it.
   */
  private async parkSteerSnapshot(
    streamId: string,
    job: SerializableJobData,
    steers: TPendingSteer[],
  ): Promise<void> {
    if (steers.length === 0) {
      return;
    }
    try {
      await this.parkSteers(
        streamId,
        JSON.stringify({
          userId: job.userId,
          ...(job.tenantId != null && { tenantId: job.tenantId }),
          steers,
        }),
      );
    } catch (err) {
      logger.warn(`[RedisJobStore] Failed to park steers ${streamId}:`, err);
    }
  }

  async claimParkedSteers(streamId: string, ownerFragment: string): Promise<string | undefined> {
    const claimed = (await this.redis.eval(
      CLAIM_PARKED_LUA,
      1,
      KEYS.parkedSteers(streamId),
      ownerFragment,
    )) as string | null;
    // '' is the non-owner sentinel (payload left in place) — reads as "nothing".
    return claimed ? claimed : undefined;
  }

  /** A malformed entry is dropped (logged) rather than poisoning the drain. */
  private parseSteerItems(raw: unknown): SteerQueueItem[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const items: SteerQueueItem[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        continue;
      }
      try {
        items.push(JSON.parse(entry) as SteerQueueItem);
      } catch {
        logger.warn('[RedisJobStore] Dropping malformed steer queue entry');
      }
    }
    return items;
  }

  /**
   * Append a streaming chunk to Redis Stream.
   * Uses XADD for efficient append-only storage.
   * Sets TTL on first chunk to ensure cleanup if job crashes.
   */
  async appendChunk(streamId: string, event: unknown): Promise<void> {
    const key = KEYS.chunks(streamId);
    const jobKey = KEYS.job(streamId);
    // XADD + derive-and-extend-only EXPIRE in a single atomic eval. Refreshing the TTL on
    // every chunk (vs only once) keeps the key alive through long streams, but it must
    // NEVER shrink an already-longer TTL — a paused (requires_action) job needs this key
    // to live for the whole approval window, and the on_pending_action append (or any
    // chunk that lands after the pause) would otherwise reset it to the short running TTL.
    // The script reads the paused window from the job key, so it bumps to the approval TTL
    // even when the pause's own EXPIRE no-op'd because this key didn't exist yet, while a
    // normally-running run still settles on the short running TTL. Both keys share the
    // {streamId} hash tag, so the 2-key eval stays on one slot under Redis Cluster.
    await this.redis.eval(
      CHUNK_APPEND_LUA,
      2,
      key,
      jobKey,
      JSON.stringify(event),
      String(this.ttl.running),
    );
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
   * Save run steps for resume state. Uses the paused-window TTL script so a run-step save
   * landing at/after a HITL pause extends to the approval window instead of resetting the
   * key to the short running TTL (which would drop the tool timeline on a reload of a
   * still-live approval — mirrors the chunk-stream no-shrink behavior).
   */
  async saveRunSteps(streamId: string, runSteps: Agents.RunStep[]): Promise<void> {
    await this.redis.eval(
      RUNSTEPS_SAVE_LUA,
      2,
      KEYS.runSteps(streamId),
      KEYS.job(streamId),
      JSON.stringify(runSteps),
      String(this.ttl.running),
    );
  }

  // ===== Consumer Group Methods =====
  // These enable tracking which chunks each client has seen.
  // Based on https://upstash.com/blog/resumable-llm-streams

  /**
   * Create a consumer group for a stream.
   * Used to track which chunks a client has already received.
   *
   * @param streamId - The stream identifier
   * @param groupName - Unique name for the consumer group (e.g., session ID)
   * @param startFrom - Where to start reading ('0' = from beginning, '$' = only new)
   */
  async createConsumerGroup(
    streamId: string,
    groupName: string,
    startFrom: '0' | '$' = '0',
  ): Promise<void> {
    const key = KEYS.chunks(streamId);
    try {
      await this.redis.xgroup('CREATE', key, groupName, startFrom, 'MKSTREAM');
      logger.debug(`[RedisJobStore] Created consumer group ${groupName} for ${streamId}`);
    } catch (err) {
      // BUSYGROUP error means group already exists - that's fine
      const error = err as Error;
      if (!error.message?.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  /**
   * Read chunks from a consumer group (only unseen chunks).
   * This is the key to the resumable stream pattern.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param consumerName - Name of the consumer within the group
   * @param count - Maximum number of chunks to read (default: all available)
   * @returns Array of { id, event } where id is the Redis stream entry ID
   */
  async readChunksFromGroup(
    streamId: string,
    groupName: string,
    consumerName: string = 'consumer-1',
    count?: number,
  ): Promise<Array<{ id: string; event: unknown }>> {
    const key = KEYS.chunks(streamId);

    try {
      // XREADGROUP GROUP groupName consumerName [COUNT count] STREAMS key >
      // The '>' means only read new messages not yet delivered to this consumer
      let result;
      if (count) {
        result = await this.redis.xreadgroup(
          'GROUP',
          groupName,
          consumerName,
          'COUNT',
          count,
          'STREAMS',
          key,
          '>',
        );
      } else {
        result = await this.redis.xreadgroup('GROUP', groupName, consumerName, 'STREAMS', key, '>');
      }

      if (!result || result.length === 0) {
        return [];
      }

      // Result format: [[streamKey, [[id, [field, value, ...]], ...]]]
      const [, messages] = result[0] as [string, Array<[string, string[]]>];
      const chunks: Array<{ id: string; event: unknown }> = [];

      for (const [id, fields] of messages) {
        const eventIdx = fields.indexOf('event');
        if (eventIdx >= 0 && eventIdx + 1 < fields.length) {
          try {
            chunks.push({
              id,
              event: JSON.parse(fields[eventIdx + 1]),
            });
          } catch {
            // Skip malformed entries
          }
        }
      }

      return chunks;
    } catch (err) {
      const error = err as Error;
      // NOGROUP error means the group doesn't exist yet
      if (error.message?.includes('NOGROUP')) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Acknowledge that chunks have been processed.
   * This tells Redis we've successfully delivered these chunks to the client.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param messageIds - Array of Redis stream entry IDs to acknowledge
   */
  async acknowledgeChunks(
    streamId: string,
    groupName: string,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    const key = KEYS.chunks(streamId);
    await this.redis.xack(key, groupName, ...messageIds);
  }

  /**
   * Delete a consumer group.
   * Called when a client disconnects and won't reconnect.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name to delete
   */
  async deleteConsumerGroup(streamId: string, groupName: string): Promise<void> {
    const key = KEYS.chunks(streamId);
    try {
      await this.redis.xgroup('DESTROY', key, groupName);
      logger.debug(`[RedisJobStore] Deleted consumer group ${groupName} for ${streamId}`);
    } catch {
      // Ignore errors - group may not exist
    }
  }

  /**
   * Get pending chunks for a consumer (chunks delivered but not acknowledged).
   * Useful for recovering from crashes.
   *
   * @param streamId - The stream identifier
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   */
  async getPendingChunks(
    streamId: string,
    groupName: string,
    consumerName: string = 'consumer-1',
  ): Promise<Array<{ id: string; event: unknown }>> {
    const key = KEYS.chunks(streamId);

    try {
      // Read pending messages (delivered but not acked) by using '0' instead of '>'
      const result = await this.redis.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'STREAMS',
        key,
        '0',
      );

      if (!result || result.length === 0) {
        return [];
      }

      const [, messages] = result[0] as [string, Array<[string, string[]]>];
      const chunks: Array<{ id: string; event: unknown }> = [];

      for (const [id, fields] of messages) {
        const eventIdx = fields.indexOf('event');
        if (eventIdx >= 0 && eventIdx + 1 < fields.length) {
          try {
            chunks.push({
              id,
              event: JSON.parse(fields[eventIdx + 1]),
            });
          } catch {
            // Skip malformed entries
          }
        }
      }

      return chunks;
    } catch {
      return [];
    }
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
      tenantId: data.tenantId || undefined,
      status: data.status as JobStatus,
      createdAt: parseInt(data.createdAt, 10),
      completedAt: data.completedAt ? parseInt(data.completedAt, 10) : undefined,
      conversationId: data.conversationId || undefined,
      error: data.error || undefined,
      userMessage: data.userMessage ? JSON.parse(data.userMessage) : undefined,
      responseMessageId: data.responseMessageId || undefined,
      createdEventEmitted: data.createdEventEmitted === '1',
      sender: data.sender || undefined,
      syncSent: data.syncSent === '1',
      finalEvent: data.finalEvent || undefined,
      endpoint: data.endpoint || undefined,
      iconURL: data.iconURL || undefined,
      model: data.model || undefined,
      promptTokens: data.promptTokens ? parseInt(data.promptTokens, 10) : undefined,
      agent_id: data.agent_id || undefined,
      isTemporary: data.isTemporary != null ? data.isTemporary === '1' : undefined,
      // Deferred tools discovered before a HITL pause; replayed into createRun on resume.
      discoveredTools: data.discoveredTools ? JSON.parse(data.discoveredTools) : undefined,
      titleEvent: data.titleEvent || undefined,
      replayEvents: data.replayEvents || undefined,
      contextUsage: data.contextUsage || undefined,
      tokenUsage: data.tokenUsage || undefined,
      pendingAction: this.parsePendingAction(data.pendingAction),
      pendingActionId: data.pendingActionId || undefined,
      lastActiveAt: data.lastActiveAt ? parseInt(data.lastActiveAt, 10) : undefined,
    };
  }

  /**
   * Parse a persisted `pendingAction`, defending the cold-resume path against
   * malformed or stale records: a corrupt JSON blob or a payload whose shape
   * predates the current SDK contract is dropped (logged) rather than crashing
   * the resume or feeding a bad record to an approval route. Returns undefined
   * when absent/invalid.
   */
  private parsePendingAction(raw: string | undefined): Agents.PendingAction | undefined {
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as Agents.PendingAction;
      const typeOk =
        typeof parsed?.actionId === 'string' &&
        KNOWN_INTERRUPT_TYPES.has(parsed?.payload?.type as string);
      if (!typeOk) {
        logger.warn('[RedisJobStore] Dropping malformed pendingAction record');
        return undefined;
      }
      return parsed;
    } catch {
      logger.warn('[RedisJobStore] Dropping unparseable pendingAction record');
      return undefined;
    }
  }
}
