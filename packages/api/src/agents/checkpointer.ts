import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { INTERRUPT } from '@langchain/langgraph-checkpoint';
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
 * Defensive cap on the number of in-flight interrupt checkpoint ids tracked between an
 * interrupt `putWrites` and its matching `put`. Under normal flow each id is consumed by
 * the immediately-following `put`, so the set holds at most a handful; the cap only guards
 * against a process that dies in that microsecond window leaking ids forever.
 */
const MAX_TRACKED_INTERRUPTS = 1024;

/**
 * A `MongoDBSaver` that persists ONLY the checkpoints created at an interrupt (a HITL pause),
 * discarding the one LangGraph writes on a CLEAN exit.
 *
 * **Why.** With `durability: 'exit'` (set by the SDK whenever a checkpointer is active) the
 * graph persists exactly one checkpoint at the exit boundary on EVERY run — paused or not.
 * A non-paused turn therefore writes a dead checkpoint whose only fate is to be pruned by
 * {@link deleteAgentCheckpoint}. HITL only ever resumes an *interrupt* checkpoint, so the
 * clean-exit one is pure write+delete churn on the common path. This saver skips it.
 *
 * **How it tells them apart** (verified empirically against `@langchain/langgraph`): when a
 * run interrupts, the runner calls `putWrites` with the `INTERRUPT` (`"__interrupt__"`)
 * channel for the checkpoint it is about to create, and that write's `config.checkpoint_id`
 * equals the `checkpoint.id` of the `put` that immediately follows. A clean exit calls `put`
 * with no preceding interrupt `putWrites`. So we record the checkpoint id of any interrupt
 * `putWrites` and persist a `put` only when its `checkpoint.id` was so marked. Keying on the
 * globally-unique checkpoint id (NOT thread_id) keeps this correct even when two runs race
 * on the same conversation (`thread_id`) — the job-replacement scenario.
 *
 * **Correctness.** Interrupt checkpoints and their pending writes are persisted exactly as
 * before, so resume is unchanged. Clean checkpoints were only ever written-then-pruned, so
 * not writing them is observationally equivalent; the eager prune stays as the backstop for
 * any lingering interrupt checkpoint. `getTuple`/`list`/`deleteThread`/`setup` are inherited.
 */
export class InterruptOnlyMongoSaver extends MongoDBSaver {
  /** checkpoint ids an interrupt `putWrites` flagged; each consumed by its matching `put`. */
  private readonly interruptedCheckpointIds = new Set<string>();

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (checkpointId && writes.some((write) => write[0] === INTERRUPT)) {
      if (this.interruptedCheckpointIds.size >= MAX_TRACKED_INTERRUPTS) {
        // Evict the oldest unconsumed id (a leak from a crash between putWrites and put).
        const oldest = this.interruptedCheckpointIds.values().next().value;
        if (oldest !== undefined) {
          this.interruptedCheckpointIds.delete(oldest);
        }
      }
      this.interruptedCheckpointIds.add(checkpointId);
    }
    // Always persist the writes: an interrupt's pending writes are required for resume, and
    // under `durability: 'exit'` a clean run never calls putWrites at all.
    return super.putWrites(config, writes, taskId);
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    if (this.interruptedCheckpointIds.delete(checkpoint.id)) {
      // Produced by an interrupt (pause) — persist it so the run can be resumed.
      return super.put(config, checkpoint, metadata);
    }
    // Clean exit: discard. Return the config LangGraph expects (pointing at the checkpoint
    // it believes was saved) so the run finishes normally; nothing durable is written.
    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_id: checkpoint.id,
      },
    };
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
    const saver = new InterruptOnlyMongoSaver({
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
