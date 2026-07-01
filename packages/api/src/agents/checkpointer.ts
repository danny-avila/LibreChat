import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import type { TCheckpointerConfig } from 'librechat-data-provider';

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
    const saver = new MongoDBSaver({
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
