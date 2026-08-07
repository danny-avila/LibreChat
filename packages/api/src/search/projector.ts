import { logger } from '@librechat/data-schemas';
import type { DrainedSearchEvent } from '@librechat/data-schemas';
import type {
  ProjectionSource,
  SearchClient,
  SearchKind,
  SearchPool,
  SearchRecordKey,
} from './types';
import type { ProjectionSourceReader, SourceCursor } from './source';
import type { Lease } from './lease';
import {
  clearFailure,
  currentVersionSnapshot,
  quarantinedKeys,
  recordFailure,
  recordKeyString,
  sweepUnseen,
  tombstoneDocument,
  upsertDocument,
} from './writer';
import {
  DEFAULT_EMBEDDING_SPACE,
  DRAIN_INTERVAL_MS,
  SAFETY_POLL_INTERVAL_MS,
  SAFETY_POLL_LOOKBACK_MS,
  SWEEP_INTERVAL_MS,
} from './constants';
import { withTransaction } from './pool';
import { acquireLease } from './lease';

const KINDS: readonly SearchKind[] = ['message', 'conversation', 'shared-link'];

const DRAIN_BATCH = 500;
const SCAN_BATCH = 500;
const RECONCILE_BATCH = 1_000;

/**
 * The queue is a fast path, never a source of truth.
 *
 * Hooks are fire-and-forget, bulk writes skip Mongoose middleware entirely, and
 * TTL deletions run no application code at all — so three layers cover the
 * source, in descending speed and ascending reliability: the event drain, the
 * `(updatedAt, _id)` safety poll, and full set-diff reconciliation. Losing any
 * one of them costs freshness, not correctness.
 */
export type ProjectorDeps = Readonly<{
  pool: SearchPool;
  mongoose: typeof import('mongoose');
  source: ProjectionSourceReader;
  space?: string;
  holder?: string;
  intervals?: Partial<{
    drainMs: number;
    safetyPollMs: number;
    sweepMs: number;
    lookbackMs: number;
  }>;
}>;

export type DrainOutcome = Readonly<{
  consumed: number;
  projected: number;
  tombstoned: number;
  skipped: number;
  failed: number;
}>;

type EventQueue = {
  readSearchEvents(limit: number): Promise<readonly DrainedSearchEvent[]>;
  deleteSearchEvents(ids: readonly unknown[]): Promise<void>;
  dedupeSearchEvents(events: readonly DrainedSearchEvent[]): readonly DrainedSearchEvent[];
};

function groupByKind<T extends { kind: SearchKind }>(items: readonly T[]): Map<SearchKind, T[]> {
  const grouped = new Map<SearchKind, T[]>();
  for (const item of items) {
    const bucket = grouped.get(item.kind);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(item.kind, [item]);
    }
  }
  return grouped;
}

export class Projector {
  private readonly deps: ProjectorDeps;
  private readonly queue: EventQueue;
  private readonly space: string;
  private readonly drainMs: number;
  private readonly safetyPollMs: number;
  private readonly sweepMs: number;
  private readonly lookbackMs: number;

  private lease: Lease | null = null;
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(deps: ProjectorDeps, queue: EventQueue) {
    this.deps = deps;
    this.queue = queue;
    this.space = deps.space ?? process.env.CHAT_SEARCH_EMBEDDING_SPACE ?? DEFAULT_EMBEDDING_SPACE;
    this.drainMs = deps.intervals?.drainMs ?? DRAIN_INTERVAL_MS;
    this.safetyPollMs = deps.intervals?.safetyPollMs ?? SAFETY_POLL_INTERVAL_MS;
    this.sweepMs = deps.intervals?.sweepMs ?? SWEEP_INTERVAL_MS;
    this.lookbackMs = deps.intervals?.lookbackMs ?? SAFETY_POLL_LOOKBACK_MS;
  }

  get epoch(): number | null {
    return this.lease?.epoch ?? null;
  }

  get isLeader(): boolean {
    return this.lease !== null;
  }

  /**
   * Applies one record's authoritative source state, or tombstones it when the
   * source no longer has it.
   *
   * The event only ever carries a key. Re-reading the source here is what makes
   * duplicate and out-of-order events harmless, and it is why a tombstone racing
   * an upsert resolves correctly regardless of which event the queue yields
   * first.
   */
  private async applyOne(
    client: SearchClient,
    epoch: number,
    key: SearchRecordKey,
    source: ProjectionSource | undefined,
  ): Promise<'projected' | 'tombstoned' | 'skipped'> {
    if (!source) {
      const result = await tombstoneDocument(client, epoch, key);
      return result.applied ? 'tombstoned' : 'skipped';
    }
    /**
     * Partial assistant rows are rewritten at finalize. Projecting them makes a
     * half-written generation searchable and embeds the same turn twice.
     */
    if (source.unfinished) {
      return 'skipped';
    }
    const result = await upsertDocument(client, epoch, source, this.space);
    return result.applied ? 'projected' : 'skipped';
  }

  /** Fast path: drain the event queue and project what it names. */
  async drain(): Promise<DrainOutcome> {
    const epoch = this.lease?.epoch;
    if (epoch == null) {
      return { consumed: 0, projected: 0, tombstoned: 0, skipped: 0, failed: 0 };
    }

    const events = await this.queue.readSearchEvents(DRAIN_BATCH);
    if (events.length === 0) {
      return { consumed: 0, projected: 0, tombstoned: 0, skipped: 0, failed: 0 };
    }

    const deduped = this.queue.dedupeSearchEvents(events);
    const quarantined = await withTransaction(this.deps.pool, (client) =>
      quarantinedKeys(client, deduped),
    );

    let projected = 0;
    let tombstoned = 0;
    let skipped = 0;
    let failed = 0;

    for (const [kind, batch] of groupByKind(deduped)) {
      const live = batch.filter((event) => !quarantined.has(recordKeyString(event)));
      skipped += batch.length - live.length;
      if (live.length === 0) {
        continue;
      }

      const sources = await this.deps.source.read(kind, live);
      const byKey = new Map(sources.map((source) => [recordKeyString(source), source]));

      for (const event of live) {
        try {
          const outcome = await withTransaction(this.deps.pool, (client) =>
            this.applyOne(client, epoch, event, byKey.get(recordKeyString(event))),
          );
          if (outcome === 'projected') {
            projected++;
          } else if (outcome === 'tombstoned') {
            tombstoned++;
          } else {
            skipped++;
          }
          await withTransaction(this.deps.pool, (client) => clearFailure(client, event));
        } catch (error) {
          failed++;
          logger.error('[chatSearch] failed to project a record', error);
          await withTransaction(this.deps.pool, (client) =>
            recordFailure(client, event, error),
          ).catch(() => undefined);
        }
      }
    }

    /**
     * Every event read is consumed, including the ones that failed: the failure
     * counter drives the poison-row policy, and the safety poll re-discovers a
     * record whose event was dropped. Leaving failures in the queue would let one
     * malformed document stall everything queued behind it.
     */
    await this.queue.deleteSearchEvents(events.map((event) => event._id));

    return { consumed: events.length, projected, tombstoned, skipped, failed };
  }

  private async readPollCursor(kind: SearchKind): Promise<SourceCursor | null> {
    const { rows } = await this.deps.pool.query<{
      updated_at: Date | null;
      record_id: string | null;
    }>('SELECT updated_at, record_id FROM chat_search.poll_cursor WHERE kind = $1', [kind]);
    const row = rows[0];
    if (!row?.updated_at || row.record_id == null) {
      return null;
    }
    return { updatedAt: row.updated_at, recordId: row.record_id };
  }

  private async writePollCursor(kind: SearchKind, cursor: SourceCursor | null): Promise<void> {
    if (!cursor) {
      return;
    }
    /**
     * Rewind by the lookback before storing. `updatedAt` is generated on the
     * application side, so cross-pod clock skew plus read-before-commit
     * visibility means a write stamped `T - epsilon` can land after the scan
     * passed `T`. Re-scanning the trailing window with idempotent upserts is what
     * makes that row recoverable instead of permanently invisible.
     */
    const rewound = new Date(cursor.updatedAt.getTime() - this.lookbackMs);
    await this.deps.pool.query(
      `INSERT INTO chat_search.poll_cursor (kind, updated_at, record_id, scanned_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (kind) DO UPDATE SET
         updated_at = excluded.updated_at,
         record_id = excluded.record_id,
         scanned_at = now()`,
      [kind, rewound, cursor.recordId],
    );
  }

  /** Safety net: keyset scan that catches whatever the queue never carried. */
  async safetyPoll(): Promise<number> {
    const epoch = this.lease?.epoch;
    if (epoch == null) {
      return 0;
    }

    let projected = 0;
    for (const kind of KINDS) {
      const from = await this.readPollCursor(kind);
      const page = await this.deps.source.scan(kind, from, SCAN_BATCH);
      if (page.sources.length === 0) {
        continue;
      }

      for (const source of page.sources) {
        if (source.unfinished) {
          continue;
        }
        try {
          const result = await withTransaction(this.deps.pool, (client) =>
            upsertDocument(client, epoch, source, this.space),
          );
          if (result.applied) {
            projected++;
          }
        } catch (error) {
          logger.error('[chatSearch] safety poll failed to project a record', error);
          await withTransaction(this.deps.pool, (client) =>
            recordFailure(client, source, error),
          ).catch(() => undefined);
        }
      }

      await this.writePollCursor(kind, page.cursor);
    }
    return projected;
  }

  /**
   * Full reconciliation by set difference.
   *
   * Streams source keys per kind and tombstones what PostgreSQL holds but the
   * source no longer does. Deliberately not per-row run-ID stamping: that would
   * rewrite every projection row on every run, which at ten million rows is
   * hundreds of millions of bookkeeping writes a day for no information gain.
   *
   * The version snapshot is taken *before* the scan begins, so a record
   * projected while the scan is in flight is never treated as unseen.
   */
  async reconcile(): Promise<number> {
    const epoch = this.lease?.epoch;
    if (epoch == null) {
      return 0;
    }

    let tombstoned = 0;
    for (const kind of KINDS) {
      const snapshot = await withTransaction(this.deps.pool, (client) =>
        currentVersionSnapshot(client),
      );

      const seenByScope = new Map<string, { tenantId: string; userId: string; ids: string[] }>();
      for await (const batch of this.deps.source.keys(kind, RECONCILE_BATCH)) {
        for (const key of batch) {
          const scopeKey = `${key.tenantId}${key.userId}`;
          const bucket = seenByScope.get(scopeKey);
          if (bucket) {
            bucket.ids.push(key.recordId);
          } else {
            seenByScope.set(scopeKey, {
              tenantId: key.tenantId,
              userId: key.userId,
              ids: [key.recordId],
            });
          }
        }
      }

      /**
       * Scopes present in PostgreSQL but absent from the source entirely still
       * need sweeping, so the projected scopes are unioned in with an empty seen
       * set rather than skipped.
       */
      const { rows } = await this.deps.pool.query<{ tenant_id: string; user_id: string }>(
        `SELECT DISTINCT tenant_id, user_id FROM chat_search.documents
          WHERE kind = $1 AND deleted_at IS NULL`,
        [kind],
      );
      for (const row of rows) {
        const scopeKey = `${row.tenant_id}${row.user_id}`;
        if (!seenByScope.has(scopeKey)) {
          seenByScope.set(scopeKey, { tenantId: row.tenant_id, userId: row.user_id, ids: [] });
        }
      }

      for (const { tenantId, userId, ids } of seenByScope.values()) {
        try {
          tombstoned += await withTransaction(this.deps.pool, (client) =>
            sweepUnseen(client, epoch, kind, snapshot, ids, { tenantId, userId }),
          );
        } catch (error) {
          logger.error('[chatSearch] reconciliation sweep failed for a scope', error);
        }
      }
    }
    return tombstoned;
  }

  private schedule(fn: () => Promise<unknown>, intervalMs: number, label: string): void {
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight || !this.running) {
        return;
      }
      inFlight = true;
      void fn()
        .catch((error) => logger.error(`[chatSearch] ${label} failed`, error))
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);
    timer.unref?.();
    this.timers.push(timer);
  }

  /**
   * Becomes the projector if no other pod holds the lease, then runs the three
   * layers on their own cadences. Returns false when another pod is leading —
   * serving continues either way; only projection is exclusive.
   */
  async start(): Promise<boolean> {
    if (this.running) {
      return this.isLeader;
    }
    const holder = this.deps.holder ?? `${process.pid}@${process.env.HOSTNAME ?? 'local'}`;
    this.lease = await acquireLease(this.deps.pool, holder);
    if (!this.lease) {
      logger.info('[chatSearch] another pod holds the projector lease; not projecting');
      return false;
    }

    this.running = true;
    logger.info(`[chatSearch] projector started at epoch ${this.lease.epoch}`);

    this.schedule(() => this.drain(), this.drainMs, 'drain');
    this.schedule(() => this.safetyPoll(), this.safetyPollMs, 'safety poll');
    this.schedule(() => this.reconcile(), this.sweepMs, 'reconciliation');
    this.schedule(
      async () => {
        const held = await this.lease?.renew();
        if (held === false) {
          logger.warn('[chatSearch] projector lease lost; stopping');
          await this.stop();
        }
      },
      Math.max(1_000, Math.floor(this.drainMs * 2)),
      'lease renewal',
    );

    return true;
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    await this.lease?.release();
    this.lease = null;
  }
}
