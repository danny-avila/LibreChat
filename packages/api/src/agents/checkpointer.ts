import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { Checkpoint, CheckpointMetadata, PendingWrite } from '@langchain/langgraph-checkpoint';

/**
 * Durable checkpointing for human-in-the-loop (HITL) resume.
 *
 * This is the seam between LibreChat and LangGraph's checkpoint machinery. A run
 * that pauses for tool approval suspends its graph state to a checkpoint; resuming
 * rebuilds that state on a *fresh* `Run` (see `agents/run.ts`), which only works if
 * the checkpoint outlives the original request — across a restart, or on another
 * replica. So HITL needs a durable saver, not the SDK's process-local `MemorySaver`.
 *
 * Two adapters sit behind the one interface ({@link getAgentCheckpointer}):
 *   - `MongoDBSaver` over the app's existing Mongo connection (the default), and
 *   - `undefined`, which lets the SDK install its own in-process `MemorySaver`
 *     (single-process / dev, or whenever Mongo isn't ready yet).
 *
 * Storage is bounded two ways: a Mongo TTL index reclaims runs that are never
 * resolved ({@link DEFAULT_CHECKPOINT_TTL_SECONDS}), and {@link deleteAgentCheckpoint}
 * prunes a thread's checkpoints eagerly on every terminal transition.
 */

/**
 * Soft size threshold that triggers a sweep of STALE write-anchor ids. The map normally
 * holds a handful (each id is consumed by the `put` that immediately follows its
 * `putWrites`); this only bounds a slow leak from a process that dies in that window.
 */
const WRITE_ANCHOR_SWEEP_THRESHOLD = 1024;

/**
 * A write-anchor id is considered stale once this much wall-clock has passed without its
 * matching `put` — a `put` always follows its `putWrites` within the same exit sequence
 * (milliseconds), so anything this old is from a crashed run, never a valid in-flight id.
 * Generous on purpose: we would rather keep a tracked id slightly too long than evict a
 * valid one and mis-classify its (possibly slow-I/O) interrupt `put` as a clean exit.
 */
const WRITE_ANCHOR_STALE_MS = 5 * 60 * 1000;

/**
 * A `MongoDBSaver` that persists ONLY checkpoints carrying pending writes — an interrupt
 * (a HITL pause) or a delta-channel anchor — and discards the no-write checkpoint LangGraph
 * writes on a CLEAN exit.
 *
 * **Why.** With `durability: 'exit'` (set by the SDK whenever a checkpointer is active) the
 * graph persists exactly one checkpoint at the exit boundary on EVERY run — paused or not.
 * A non-paused turn therefore writes a dead checkpoint whose only fate is to be pruned by
 * {@link deleteAgentCheckpoint}. HITL only ever resumes a checkpoint that has pending writes,
 * so the clean (write-less) exit checkpoint is pure write+delete churn on the common path.
 * This saver skips it.
 *
 * **How it tells them apart** (verified empirically against `@langchain/langgraph`): LangGraph
 * calls `putWrites` for a checkpoint BEFORE the `put` that creates it, with `config.checkpoint_id`
 * equal to that `put`'s `checkpoint.id`. An interrupt records `INTERRUPT` ("__interrupt__")
 * writes; a delta-channel graph records its delta writes (and may anchor them on a synthetic
 * parent checkpoint that the interrupt checkpoint then points at). A CLEAN exit produces a
 * checkpoint with NO pending writes. So we record the checkpoint id of ANY `putWrites` and
 * persist a `put` only when its `checkpoint.id` was so marked — which keeps interrupt
 * checkpoints AND any delta-anchor parents (resume can walk the chain), while still dropping
 * the write-less clean-exit checkpoint. Keying on the globally-unique checkpoint id (NOT
 * thread_id) stays correct even when two runs race on the same conversation (`thread_id`).
 *
 * For LibreChat's agent graph (standard `Annotation` channels, no `DeltaChannel`) a clean run
 * makes no `putWrites` at all, so this is effectively interrupt-only and the common path
 * writes nothing; the broader "has pending writes" rule just makes it robust to delta graphs.
 *
 * **Correctness.** Checkpoints with pending writes (interrupt + delta-anchor) and the writes
 * themselves persist exactly as before, so resume is unchanged. The no-write clean checkpoint
 * was only ever written-then-pruned, so not writing it is observationally equivalent; the
 * pre-run prune + Mongo TTL remain the backstops. `getTuple`/`list`/`deleteThread`/`setup`
 * are inherited.
 */
export class LazyMongoSaver extends MongoDBSaver {
  /** checkpoint id → time the `putWrites` flagging it arrived; each consumed by its `put`. */
  private readonly writeAnchorIds = new Map<string, number>();

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (checkpointId) {
      // A checkpoint that receives ANY pending writes must be persisted by its `put`: an
      // interrupt, or a delta-channel anchor whose writes a later checkpoint depends on.
      this.recordWriteAnchor(checkpointId);
    }
    return super.putWrites(config, writes, taskId);
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    if (this.writeAnchorIds.delete(checkpoint.id)) {
      // Has pending writes (interrupt / delta anchor) — persist so resume can read it.
      return super.put(config, checkpoint, metadata);
    }
    // No pending writes ⇒ a clean exit: discard. Return the config LangGraph expects
    // (pointing at the checkpoint it believes was saved) so the run finishes normally;
    // nothing durable is written.
    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  /**
   * Track a checkpoint id that received pending writes. Evicts ONLY genuinely-stale ids
   * (older than {@link WRITE_ANCHOR_STALE_MS}, i.e. from a crashed run whose `put` never
   * landed) — never a recent in-flight id — so a slow-I/O interrupt `put` is never
   * mis-classified as a clean exit. If nothing is stale the map is allowed to grow rather
   * than drop a valid id; the next sweep reclaims the crashed ones.
   */
  private recordWriteAnchor(checkpointId: string): void {
    const now = Date.now();
    if (this.writeAnchorIds.size >= WRITE_ANCHOR_SWEEP_THRESHOLD) {
      for (const [id, recordedAt] of this.writeAnchorIds) {
        if (now - recordedAt > WRITE_ANCHOR_STALE_MS) {
          this.writeAnchorIds.delete(id);
        }
      }
    }
    this.writeAnchorIds.set(checkpointId, now);
  }
}

/** Default approval window and checkpoint TTL: 24h. */
export const DEFAULT_CHECKPOINT_TTL_SECONDS = 86400;

const DEFAULT_CHECKPOINT_COLLECTION = 'agent_checkpoints';
const DEFAULT_CHECKPOINT_WRITES_COLLECTION = 'agent_checkpoint_writes';

/** Checkpointer settings with all defaults applied. */
export interface ResolvedCheckpointerConfig {
  type: 'mongo' | 'memory';
  /** Approval window / TTL in seconds. */
  ttlSeconds: number;
  checkpointCollectionName: string;
  checkpointWritesCollectionName: string;
}

/**
 * Apply defaults to the YAML `endpoints.agents.checkpointer` block. Mirrors
 * {@link resolveRecursionLimit} — the schema stays descriptive, defaults live here.
 */
export function resolveCheckpointerConfig(
  cfg: TCheckpointerConfig | undefined,
): ResolvedCheckpointerConfig {
  return {
    type: cfg?.type ?? 'mongo',
    ttlSeconds:
      typeof cfg?.ttl === 'number' && cfg.ttl > 0 ? cfg.ttl : DEFAULT_CHECKPOINT_TTL_SECONDS,
    checkpointCollectionName: cfg?.checkpointCollectionName ?? DEFAULT_CHECKPOINT_COLLECTION,
    checkpointWritesCollectionName:
      cfg?.checkpointWritesCollectionName ?? DEFAULT_CHECKPOINT_WRITES_COLLECTION,
  };
}

/** Approval-window milliseconds from the resolved config; drives pending-action expiry. */
export function getApprovalTtlMs(cfg: TCheckpointerConfig | undefined): number {
  return resolveCheckpointerConfig(cfg).ttlSeconds * 1000;
}

/**
 * One saver per process, built lazily on first use so `setup()` (index creation)
 * runs exactly once. Keyed by the resolved settings so a config change rebuilds.
 */
let saverPromise: Promise<MongoDBSaver | undefined> | undefined;
let cachedKey: string | undefined;

function settingsKey(resolved: ResolvedCheckpointerConfig): string {
  return `${resolved.checkpointCollectionName}|${resolved.checkpointWritesCollectionName}|${resolved.ttlSeconds}`;
}

/**
 * The durable saver to hand to `graphConfig.compileOptions.checkpointer`, or
 * `undefined` to let the SDK fall back to its in-process `MemorySaver`.
 *
 * Returns `undefined` (without caching) when the config selects `memory` or when
 * Mongo isn't connected yet, so a later run retries once the connection is up.
 * The SDK types the checkpointer as `unknown`, so a `MongoDBSaver` passes directly.
 */
export async function getAgentCheckpointer(
  cfg: TCheckpointerConfig | undefined,
): Promise<MongoDBSaver | undefined> {
  const resolved = resolveCheckpointerConfig(cfg);
  if (resolved.type === 'memory') {
    return undefined;
  }
  if (mongoose.connection.readyState !== 1) {
    logger.warn(
      '[checkpointer] Mongoose not connected; HITL runs will use an in-process checkpointer this turn (paused runs will not survive a restart or resolve on another replica).',
    );
    return undefined;
  }

  const key = settingsKey(resolved);
  if (!saverPromise || cachedKey !== key) {
    cachedKey = key;
    saverPromise = buildMongoSaver(resolved);
  }
  return saverPromise;
}

async function buildMongoSaver(
  resolved: ResolvedCheckpointerConfig,
): Promise<MongoDBSaver | undefined> {
  try {
    const saver = new LazyMongoSaver({
      // mongoose vends the live MongoClient; reuse it instead of opening a second
      // connection. The driver type is structurally identical but resolves to a
      // different `mongodb` copy than checkpoint-mongodb's, hence the cast.
      client: mongoose.connection.getClient() as unknown as ConstructorParameters<
        typeof MongoDBSaver
      >[0]['client'],
      checkpointCollectionName: resolved.checkpointCollectionName,
      checkpointWritesCollectionName: resolved.checkpointWritesCollectionName,
      // TTL index on `upserted_at`: an unresolved paused run is reclaimed after the
      // approval window, so a forgotten approval can never leak checkpoints forever.
      ttl: resolved.ttlSeconds,
    });
    const errors = await saver.setup();
    if (errors.length > 0) {
      logger.warn(
        '[checkpointer] MongoDBSaver.setup() reported errors (checkpoint indexes may be incomplete):',
        errors,
      );
    }
    logger.info('[checkpointer] Durable Mongo checkpointer ready for HITL resume');
    return saver;
  } catch (err) {
    // Reset so a later run can retry rather than being stuck on a failed build.
    saverPromise = undefined;
    cachedKey = undefined;
    logger.error(
      '[checkpointer] Failed to initialize Mongo checkpointer; falling back to in-process checkpointer:',
      err,
    );
    return undefined;
  }
}

/**
 * Prune a thread's checkpoints on a terminal transition — natural completion,
 * abort, or expiry — so the durable store stays bounded. The TTL index is the
 * safety net; this is the eager cleanup. No-op in memory mode or before any run
 * has built the saver (nothing to delete).
 *
 * @param threadId - the LangGraph `thread_id` (LibreChat's conversationId).
 */
export async function deleteAgentCheckpoint(
  threadId: string | undefined,
  cfg?: TCheckpointerConfig,
): Promise<void> {
  if (!threadId) {
    return;
  }
  const saver = await getAgentCheckpointer(cfg);
  if (!saver) {
    return;
  }
  try {
    await saver.deleteThread(threadId);
  } catch (err) {
    logger.warn(`[checkpointer] Failed to delete checkpoints for thread ${threadId}:`, err);
  }
}

/** Test-only: drop the memoized saver so a fresh build is forced. */
export function __resetCheckpointerForTests(): void {
  saverPromise = undefined;
  cachedKey = undefined;
}
