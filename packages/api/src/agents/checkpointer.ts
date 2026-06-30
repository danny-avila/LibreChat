import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { INTERRUPT } from '@langchain/langgraph-checkpoint';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import type { Checkpoint, CheckpointMetadata, PendingWrite } from '@langchain/langgraph-checkpoint';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { RunnableConfig } from '@langchain/core/runnables';

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
 * Does a pending-write batch make its checkpoint worth persisting for resume? True if it carries
 * an interrupt (the HITL pause that resume targets) or any real state/delta channel write (a value
 * a later checkpoint's resume depends on). False for pure bookkeeping batches — `__error__`
 * (a failed, non-paused turn), `__scheduled__`, `__resume__` — which are never HITL-resumable, so
 * persisting their checkpoint would only leak storage until the next prune / Mongo TTL.
 *
 * `INTERRUPT` is the one `__`-prefixed channel that IS resume-worthy; every other `__…__` channel
 * is langgraph bookkeeping. Constants verified against `@langchain/langgraph-checkpoint`.
 */
function hasResumableWrite(writes: PendingWrite[]): boolean {
  return (writes ?? []).some(([channel]) => {
    const name = String(channel);
    return name === INTERRUPT || !name.startsWith('__');
  });
}

/**
 * A `MongoDBSaver` that persists ONLY checkpoints carrying a {@link hasResumableWrite resumable}
 * pending write — an interrupt (a HITL pause) or a real-channel/delta anchor — and discards both
 * the no-write checkpoint LangGraph writes on a CLEAN exit and the bookkeeping-only checkpoint of
 * a failed (non-paused) turn.
 *
 * **Why.** With `durability: 'exit'` (set by the SDK whenever a checkpointer is active) the
 * graph persists exactly one checkpoint at the exit boundary on EVERY run — paused or not.
 * A non-paused turn therefore writes a dead checkpoint whose only fate is to be pruned by
 * {@link deleteAgentCheckpoint}. HITL only ever resumes a checkpoint that has pending writes,
 * so the clean (write-less) exit checkpoint is pure write+delete churn on the common path.
 * This saver skips it.
 *
 * **How it tells them apart** (verified empirically with throwaway runnable probes against
 * `@langchain/langgraph@1.4`, not source-reading): under `durability: 'exit'` LangGraph
 * calls `putWrites` for a checkpoint BEFORE the `put` that creates it, with `config.checkpoint_id`
 * equal to that `put`'s `checkpoint.id`. An interrupt records an `INTERRUPT` ("__interrupt__")
 * write; a delta-channel graph records its delta writes on a real (non-`__`-prefixed) channel.
 * A CLEAN exit produces a checkpoint with NO pending writes. So we record the checkpoint id of
 * each `putWrites` that carries a {@link hasResumableWrite resumable} write and persist a `put`
 * only when its `checkpoint.id` was so marked — which keeps interrupt checkpoints AND any
 * real-channel/delta anchors (resume can walk the chain), while dropping the write-less clean
 * exit. Keying on the globally-unique checkpoint id (NOT thread_id) stays correct even when two
 * runs race on the same conversation (`thread_id`).
 *
 * **Why "resumable" and not "any" write.** A non-paused turn that ERRORS still records a pending
 * write — on the `__error__` bookkeeping channel — followed by a `put` (probe-confirmed). Anchoring
 * on *any* write would persist that failed-turn checkpoint, and since the clean-path prune was
 * removed it would linger until the next fresh turn or the TTL. An errored turn is never
 * HITL-resumable, so {@link hasResumableWrite} excludes bookkeeping-only batches (`__error__`,
 * `__scheduled__`, `__resume__`) and the checkpoint is discarded at the source — no leak.
 *
 * For LibreChat's agent graph (standard `Annotation`/`MessagesAnnotation` channels, no
 * `DeltaChannel` — grep-confirmed in `@librechat/agents`) a clean run makes no `putWrites` at all,
 * so this is effectively interrupt-only and the common path writes nothing; the broader
 * real-channel rule just keeps it honest for delta graphs.
 *
 * **Invariant.** Correctness depends on `durability: 'exit'` (which the SDK sets whenever a
 * checkpointer is active): exactly one parentless boundary checkpoint per run, with its
 * `putWrites` ordered before its `put`. Under per-step durability LangGraph instead emits
 * `put`-before-`putWrites` for chained checkpoints — the anchor would arrive too late and a
 * checkpoint could be wrongly discarded. The SDK never runs HITL that way; if that ever changes,
 * this saver must be revisited (a parent-based guard is NOT viable — a resumed turn's clean
 * completion is itself a parented, write-less checkpoint that we correctly discard).
 *
 * **Correctness.** Checkpoints with resumable writes (interrupt + real-channel/delta anchor) and
 * the writes themselves persist exactly as before, so resume is unchanged. The write-less clean
 * checkpoint (and the now-discarded error-only checkpoint) was only ever written-then-pruned, so
 * not writing it is observationally equivalent; the pre-run prune + Mongo TTL remain the
 * backstops. `getTuple`/`list`/`deleteThread`/`setup` are inherited.
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
    if (checkpointId && hasResumableWrite(writes)) {
      // Anchor only checkpoints whose writes matter for resume: an interrupt (a HITL pause),
      // or a real state/delta channel a later checkpoint depends on. Bookkeeping-only batches
      // (e.g. `__error__` from a failed, non-paused turn) are NOT anchored, so their checkpoint
      // is discarded by `put` rather than leaking until the next prune / Mongo TTL.
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
      // Carries a resumable write (interrupt / real-channel delta anchor) — persist so resume
      // can read it.
      return super.put(config, checkpoint, metadata);
    }
    // No resumable writes ⇒ a clean exit (a non-paused completion, a resumed turn's clean
    // finish, or an error-only checkpoint): discard. Return the config LangGraph expects
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
