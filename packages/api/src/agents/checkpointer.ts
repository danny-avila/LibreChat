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
 * Does a pending-write batch make its checkpoint worth persisting (ANCHOR it)? True if it
 * carries an interrupt (the HITL pause that resume targets) or any real state/delta channel
 * write (a value a later checkpoint's resume depends on). False for pure bookkeeping batches —
 * `__error__` (a failed, non-paused turn), `__no_writes__` (a task that completed without state
 * updates), a lone `__resume__`, `__scheduled__` — which never justify keeping a checkpoint on
 * their own. A false verdict does NOT mean the batch is discarded: bookkeeping rows are still
 * required when the checkpoint is retained (see the buffering in `LazyMongoSaver.putWrites`);
 * this predicate only decides anchoring.
 *
 * `INTERRUPT` is the one `__`-prefixed channel that IS anchor-worthy; every other `__…__`
 * channel is langgraph bookkeeping. Constants verified against `@langchain/langgraph`.
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
 * **Bookkeeping batches follow their checkpoint's fate.** Only a {@link hasResumableWrite
 * resumable} batch ANCHORS a checkpoint (justifies persisting it); a bookkeeping-only batch
 * (`__error__`, `__no_writes__`, a lone `__resume__`, …) never does — but whether its ROWS matter
 * depends on whether the checkpoint survives, which `put` decides later. Probe-confirmed both
 * ways: a failed non-paused turn emits `putWrites([__error__])` + `put` — persisting either half
 * would leak (an orphan row or a dead checkpoint) — while a paused Send fan-out records completed
 * siblings as `__no_writes__` markers on the RETAINED interrupt checkpoint, and dropping those
 * re-executes the siblings on resume (duplicated side effects). So bookkeeping batches are
 * BUFFERED in memory until the fate is known: forwarded once the checkpoint is anchored (or was
 * just persisted), dropped when its `put` discards it. Net effect: an errored turn still leaves
 * NOTHING durable (0 checkpoints, 0 write rows), and a retained checkpoint keeps EVERY pending
 * write LangGraph recorded for it — byte-for-byte what a plain `MongoDBSaver` would store.
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
/** A bookkeeping-only pending-write batch held until its checkpoint's fate is decided. */
interface BufferedWriteBatch {
  at: number;
  batches: Array<{ config: RunnableConfig; writes: PendingWrite[]; taskId: string }>;
}

export class LazyMongoSaver extends MongoDBSaver {
  /** checkpoint id → time the resumable `putWrites` anchoring it arrived; consumed by `put`. */
  private readonly writeAnchorIds = new Map<string, number>();
  /** checkpoint id → time its anchored `put` persisted it, so a bookkeeping batch that lands
   * after the `put` (concurrent dispatch) is forwarded instead of buffered forever. */
  private readonly persistedIds = new Map<string, number>();
  /** checkpoint id → bookkeeping batches parked until the checkpoint persists or is discarded. */
  private readonly bufferedBookkeeping = new Map<string, BufferedWriteBatch>();

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!checkpointId) {
      // No checkpoint id to tie a fate to — forward untouched (the base saver's contract).
      return super.putWrites(config, writes, taskId);
    }
    if (!hasResumableWrite(writes)) {
      // A bookkeeping-only batch (`__error__` from a failed turn, a completed Send-sibling's
      // `__no_writes__` marker, a lone `__resume__`, …). It must NOT anchor the checkpoint,
      // but its rows follow the checkpoint's fate: required on a RETAINED checkpoint
      // (probe-confirmed — dropping a sibling's `__no_writes__` marker re-executes the
      // sibling on resume), an orphan on a discarded one. Forward when the fate is already
      // known to be "persist"; otherwise buffer until an anchoring batch or `put` decides.
      if (this.writeAnchorIds.has(checkpointId) || this.persistedIds.has(checkpointId)) {
        return super.putWrites(config, writes, taskId);
      }
      const buffered = this.bufferedBookkeeping.get(checkpointId);
      if (buffered) {
        buffered.batches.push({ config, writes, taskId });
      } else {
        sweepStale(this.bufferedBookkeeping, (b) => b.at);
        this.bufferedBookkeeping.set(checkpointId, {
          at: Date.now(),
          batches: [{ config, writes, taskId }],
        });
      }
      return;
    }
    // A resumable batch — an interrupt (a HITL pause) or a real state/delta channel a later
    // checkpoint depends on — anchors the checkpoint so its `put` persists it. Keyed on the
    // globally-unique checkpoint id so concurrent runs on the same `thread_id` can't
    // cross-consume anchors. The anchor is recorded BEFORE the awaited super call on purpose:
    // LangGraph dispatches the matching `put` concurrently with `putWrites` (probe-confirmed),
    // so recording after the await could let a slow-I/O interrupt `put` miss its anchor and be
    // wrongly discarded.
    this.recordWriteAnchor(checkpointId);
    try {
      const buffered = this.bufferedBookkeeping.get(checkpointId);
      this.bufferedBookkeeping.delete(checkpointId);
      if (buffered) {
        // The checkpoint's fate is now "persist" — flush the bookkeeping batches that
        // arrived before this anchor so the stored pending writes are complete.
        await Promise.all(
          buffered.batches.map((b) => super.putWrites(b.config, b.writes, b.taskId)),
        );
      }
      return await super.putWrites(config, writes, taskId);
    } catch (err) {
      // The write batch never landed — best-effort un-anchor so the concurrent `put` doesn't
      // persist a checkpoint whose pending writes are missing (an unresumable phantom pause).
      // If `put` already consumed the anchor, the thrown error still fails the run and the
      // pre-run prune / Mongo TTL reclaim the orphan.
      this.writeAnchorIds.delete(checkpointId);
      throw err;
    }
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    if (this.writeAnchorIds.delete(checkpoint.id)) {
      // Carries a resumable write (interrupt / real-channel delta anchor) — persist so resume
      // can read it, and remember the id briefly so any bookkeeping batch dispatched after
      // this `put` is forwarded rather than parked.
      sweepStale(this.persistedIds, (t) => t);
      this.persistedIds.set(checkpoint.id, Date.now());
      return super.put(config, checkpoint, metadata);
    }
    // No resumable writes ⇒ a clean exit (a non-paused completion, a resumed turn's clean
    // finish, or an error-only turn): discard, and drop the parked bookkeeping batches with
    // it — this is what keeps a failed turn from leaving orphan rows in the writes
    // collection. Return the config LangGraph expects (pointing at the checkpoint it believes
    // was saved) so the run finishes normally; nothing durable is written.
    this.bufferedBookkeeping.delete(checkpoint.id);
    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  /**
   * Track a checkpoint id whose `put` must persist it. Evicts ONLY genuinely-stale ids
   * (older than {@link WRITE_ANCHOR_STALE_MS}, i.e. from a crashed run whose `put` never
   * landed) — never a recent in-flight id — so a slow-I/O interrupt `put` is never
   * mis-classified as a clean exit. If nothing is stale the map is allowed to grow rather
   * than drop a valid id; the next sweep reclaims the crashed ones.
   */
  private recordWriteAnchor(checkpointId: string): void {
    sweepStale(this.writeAnchorIds, (t) => t);
    this.writeAnchorIds.set(checkpointId, Date.now());
  }
}

/**
 * Evict genuinely-stale entries from a fate-tracking map once it is crowded
 * ({@link WRITE_ANCHOR_SWEEP_THRESHOLD}). Entries from a crashed run (older than
 * {@link WRITE_ANCHOR_STALE_MS}) are reclaimed; recent in-flight entries never are.
 */
function sweepStale<T>(map: Map<string, T>, timeOf: (value: T) => number): void {
  if (map.size < WRITE_ANCHOR_SWEEP_THRESHOLD) {
    return;
  }
  const now = Date.now();
  for (const [id, value] of map) {
    if (now - timeOf(value) > WRITE_ANCHOR_STALE_MS) {
      map.delete(id);
    }
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

/**
 * Bulk variant of {@link deleteAgentCheckpoint} for terminal transitions that cover MANY
 * threads at once — deleting conversations, "delete all", account deletion. One indexed
 * `deleteMany` per collection instead of two round-trips per thread. Deletes through the
 * same live mongoose connection the saver is built on, using the same resolved collection
 * names; like the single-thread variant it no-ops in memory mode or before Mongo is
 * connected, and never throws (the conversations are already gone — the Mongo TTL remains
 * the backstop for anything this misses).
 *
 * @param threadIds - LangGraph `thread_id`s (LibreChat conversationIds); falsy entries skipped.
 */
export async function deleteAgentCheckpoints(
  threadIds: Array<string | null | undefined> | undefined,
  cfg?: TCheckpointerConfig,
): Promise<void> {
  const ids = (threadIds ?? []).filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    return;
  }
  // Reuse the saver gate: memory mode / no connection ⇒ nothing durable to delete.
  const saver = await getAgentCheckpointer(cfg);
  if (!saver) {
    return;
  }
  const resolved = resolveCheckpointerConfig(cfg);
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return;
    }
    await Promise.all([
      db.collection(resolved.checkpointCollectionName).deleteMany({ thread_id: { $in: ids } }),
      db
        .collection(resolved.checkpointWritesCollectionName)
        .deleteMany({ thread_id: { $in: ids } }),
    ]);
  } catch (err) {
    logger.warn(
      `[checkpointer] Failed to bulk-delete checkpoints for ${ids.length} thread(s):`,
      err,
    );
  }
}

/** Test-only: drop the memoized saver so a fresh build is forced. */
export function __resetCheckpointerForTests(): void {
  saverPromise = undefined;
  cachedKey = undefined;
}
