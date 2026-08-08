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
  missingFromProjection,
  quarantinedKeys,
  recordFailure,
  recordKeyString,
  scanProjectedKeys,
  sweepMissing,
  tombstoneDocument,
  upsertDocument,
} from './writer';
import {
  DEFAULT_EMBEDDING_SPACE,
  DRAIN_INTERVAL_MS,
  SAFETY_POLL_INTERVAL_MS,
  SAFETY_POLL_LOOKBACK_MS,
  STANDBY_MAX_RETRY_MS,
  STANDBY_RETRY_MS,
  SWEEP_INTERVAL_MS,
} from './constants';
import { withTransaction } from './pool';
import { acquireLease } from './lease';

const KINDS: readonly SearchKind[] = ['message', 'conversation', 'shared-link'];

const DRAIN_BATCH = 500;
const SCAN_BATCH = 500;
const RECONCILE_BATCH = 1_000;

/**
 * Page sizes for the three layers. Overridable so a test can exercise the
 * multi-page paths — a cursor that regresses, a sweep that resumes — without
 * writing thousands of source records to produce a second page.
 */
export type ProjectorBatches = Partial<{
  drain: number;
  scan: number;
  reconcile: number;
}>;

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
  batches?: ProjectorBatches;
}>;

export type DrainOutcome = Readonly<{
  consumed: number;
  projected: number;
  tombstoned: number;
  skipped: number;
  failed: number;
}>;

export type EventQueue = {
  readSearchEvents(limit: number): Promise<readonly DrainedSearchEvent[]>;
  deleteSearchEvents(ids: readonly DrainedSearchEvent['_id'][]): Promise<void>;
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
  private readonly drainBatch: number;
  private readonly scanBatch: number;
  private readonly reconcileBatch: number;

  private lease: Lease | null = null;
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private stopped = false;
  private standbyTimer: NodeJS.Timeout | null = null;
  private standbyDelayMs = STANDBY_RETRY_MS;
  /**
   * Per kind: whether the next poll should re-scan the trailing lookback window.
   * True at startup and after a pass that caught up, so a fresh pass always
   * overlaps; false mid-pass, so a backlog advances strictly forward.
   */
  private readonly overlapNextPoll = new Map<SearchKind, boolean>();

  constructor(deps: ProjectorDeps, queue: EventQueue) {
    this.deps = deps;
    this.queue = queue;
    this.space = deps.space ?? process.env.CHAT_SEARCH_EMBEDDING_SPACE ?? DEFAULT_EMBEDDING_SPACE;
    this.drainMs = deps.intervals?.drainMs ?? DRAIN_INTERVAL_MS;
    this.safetyPollMs = deps.intervals?.safetyPollMs ?? SAFETY_POLL_INTERVAL_MS;
    this.sweepMs = deps.intervals?.sweepMs ?? SWEEP_INTERVAL_MS;
    this.lookbackMs = deps.intervals?.lookbackMs ?? SAFETY_POLL_LOOKBACK_MS;
    this.drainBatch = deps.batches?.drain ?? DRAIN_BATCH;
    this.scanBatch = deps.batches?.scan ?? SCAN_BATCH;
    this.reconcileBatch = deps.batches?.reconcile ?? RECONCILE_BATCH;
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

    const events = await this.queue.readSearchEvents(this.drainBatch);
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

  /**
   * Where the next scan of this kind starts.
   *
   * The stored cursor only ever advances. The lookback overlap is applied here,
   * at read time, and only when the previous pass caught up — that is what makes
   * a new pass re-scan the trailing window without letting a *backlogged* pass
   * rewind onto records it already read. `updatedAt` is generated application
   * side, so cross-pod clock skew plus read-before-commit visibility means a
   * write stamped `T - epsilon` can land after the scan passed `T`; re-scanning
   * that window with idempotent upserts is what makes such a row recoverable.
   */
  private async readPollCursor(kind: SearchKind): Promise<SourceCursor | null> {
    const { rows } = await this.deps.pool.query<{
      updated_at: Date | null;
      record_id: string | null;
    }>('SELECT updated_at, record_id FROM chat_search.poll_cursor WHERE kind = $1', [kind]);
    const row = rows[0];
    if (!row?.updated_at || row.record_id == null) {
      return null;
    }
    if (this.overlapNextPoll.get(kind) === false) {
      return { updatedAt: row.updated_at, recordId: row.record_id };
    }
    /**
     * An empty record id makes the keyset tiebreak match everything at the
     * rewound instant, so the overlap window is entered whole rather than
     * clipped by a record id that belongs to a different timestamp.
     */
    return { updatedAt: new Date(row.updated_at.getTime() - this.lookbackMs), recordId: '' };
  }

  /**
   * Persists the page cursor, and only ever forward.
   *
   * A cursor that can move backward is a cursor that can loop: once more than
   * one page of records shares the lookback window, a rewound write makes the
   * next scan re-select the same earliest page and the poll never reaches newer
   * rows at all. The guard makes that unrepresentable regardless of caller.
   */
  private async writePollCursor(kind: SearchKind, cursor: SourceCursor | null): Promise<void> {
    if (!cursor) {
      return;
    }
    await this.deps.pool.query(
      `INSERT INTO chat_search.poll_cursor (kind, updated_at, record_id, scanned_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (kind) DO UPDATE SET
         updated_at = excluded.updated_at,
         record_id = excluded.record_id,
         scanned_at = now()
       WHERE (excluded.updated_at, excluded.record_id)
           > (chat_search.poll_cursor.updated_at, chat_search.poll_cursor.record_id)`,
      [kind, cursor.updatedAt, cursor.recordId],
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
      const page = await this.deps.source.scan(kind, from, this.scanBatch);
      /**
       * A short page means this pass drained the backlog, so the next one starts
       * a fresh catch-up pass and re-enters the overlap window.
       */
      this.overlapNextPoll.set(kind, page.sources.length < this.scanBatch);
      if (page.sources.length === 0) {
        continue;
      }

      for (const source of page.sources) {
        if (source.unfinished) {
          continue;
        }
        try {
          const result = await withTransaction(this.deps.pool, async (client) => {
            const outcome = await upsertDocument(client, epoch, source, this.space);
            /**
             * The poll is the only path that can rescue a quarantined record: the
             * drain skips and deletes its events without ever re-reading the
             * source. Leaving the failure row behind would keep discarding every
             * later event for a record this pass just projected correctly.
             */
            await clearFailure(client, source);
            return outcome;
          });
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
   * Tombstones what PostgreSQL still serves and the source no longer has.
   *
   * Walks the projection in bounded key windows and asks the source about
   * exactly that window, rather than accumulating the whole source keyspace in
   * memory and diffing at the end. At ten million rows the accumulating form
   * costs gigabytes of resident strings and turns each large user into one
   * enormous array parameter; this form costs one window either way.
   *
   * The version snapshot is taken before the walk begins, so a record projected
   * while the walk is in flight is never treated as missing.
   */
  private async sweepDeparted(kind: SearchKind, epoch: number, snapshot: number): Promise<number> {
    let tombstoned = 0;
    let after: SearchRecordKey | null = null;

    for (;;) {
      const window: readonly SearchRecordKey[] = await withTransaction(this.deps.pool, (client) =>
        scanProjectedKeys(client, kind, after, this.reconcileBatch),
      );
      if (window.length === 0) {
        return tombstoned;
      }

      try {
        const sources = await this.deps.source.read(kind, window);
        const live = new Set(sources.map((source) => recordKeyString(source)));
        const missing = window.filter((key) => !live.has(recordKeyString(key)));
        tombstoned += await withTransaction(this.deps.pool, (client) =>
          sweepMissing(client, epoch, kind, snapshot, missing),
        );
      } catch (error) {
        logger.error('[chatSearch] reconciliation sweep failed for a key window', error);
      }

      /**
       * Resume past the window just examined rather than re-reading from the
       * start: a tombstoned row leaves the live set, but a retained one would
       * otherwise be handed back forever.
       */
      if (window.length < this.reconcileBatch) {
        return tombstoned;
      }
      after = window[window.length - 1];
    }
  }

  /**
   * Projects source records PostgreSQL is missing entirely.
   *
   * The queue is an accelerant and the poll is a forward scan, so a record whose
   * event was lost *and* whose `updatedAt` predates the cursor — every bulk
   * import, by construction — has no other way in. Without this the sweep only
   * ever removes, and "reconciliation covers it" is not true of the path that
   * most needs it to be.
   */
  private async backfillMissing(kind: SearchKind, epoch: number): Promise<number> {
    let projected = 0;

    for await (const batch of this.deps.source.keys(kind, this.reconcileBatch)) {
      let missing: readonly SearchRecordKey[];
      try {
        missing = await withTransaction(this.deps.pool, (client) =>
          missingFromProjection(client, kind, batch),
        );
      } catch (error) {
        logger.error('[chatSearch] reconciliation could not resolve a missing-key batch', error);
        continue;
      }
      if (missing.length === 0) {
        continue;
      }

      const sources = await this.deps.source.read(kind, missing);
      for (const source of sources) {
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
          logger.error('[chatSearch] reconciliation failed to backfill a record', error);
        }
      }
    }

    return projected;
  }

  /**
   * Full reconciliation, in both directions and in bounded steps.
   *
   * Deliberately not per-row run-ID stamping: that would rewrite every
   * projection row on every run, which at ten million rows is hundreds of
   * millions of bookkeeping writes a day for no information gain.
   *
   * Returns the number of rows tombstoned, which is what the sweep has always
   * reported; backfills are logged rather than folded into that number so the
   * two directions stay distinguishable.
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

      tombstoned += await this.sweepDeparted(kind, epoch, snapshot);

      const backfilled = await this.backfillMissing(kind, epoch);
      if (backfilled > 0) {
        logger.info(`[chatSearch] reconciliation backfilled ${backfilled} ${kind} records`);
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
   *
   * Losing the election is not the end of this pod's participation. A standby
   * keeps retrying with backoff, so when the leader dies and its session-scoped
   * advisory lock is released, some surviving pod picks projection back up
   * instead of the cluster silently going without one until a restart.
   */
  async start(): Promise<boolean> {
    if (this.running) {
      return this.isLeader;
    }
    this.stopped = false;
    const acquired = await this.acquire();
    if (!acquired) {
      logger.info('[chatSearch] another pod holds the projector lease; standing by');
      this.scheduleStandby();
    }
    return acquired;
  }

  /** One election attempt. Starts the loops on success, changes nothing on loss. */
  private async acquire(): Promise<boolean> {
    if (this.stopped || this.running) {
      return this.isLeader;
    }
    const holder = this.deps.holder ?? `${process.pid}@${process.env.HOSTNAME ?? 'local'}`;
    this.lease = await acquireLease(this.deps.pool, holder);
    if (!this.lease) {
      return false;
    }

    this.running = true;
    this.standbyDelayMs = STANDBY_RETRY_MS;
    logger.info(`[chatSearch] projector started at epoch ${this.lease.epoch}`);

    this.schedule(() => this.drain(), this.drainMs, 'drain');
    this.schedule(() => this.safetyPoll(), this.safetyPollMs, 'safety poll');
    this.schedule(() => this.reconcile(), this.sweepMs, 'reconciliation');
    this.schedule(
      async () => {
        const held = await this.lease?.renew();
        if (held === false) {
          logger.warn('[chatSearch] projector lease lost; standing by');
          await this.relinquish();
          this.scheduleStandby();
        }
      },
      Math.max(1_000, Math.floor(this.drainMs * 2)),
      'lease renewal',
    );

    return true;
  }

  /** Retries the election on a backoff that resets once leadership is won. */
  private scheduleStandby(): void {
    if (this.stopped || this.standbyTimer || this.running) {
      return;
    }
    const delay = this.standbyDelayMs;
    this.standbyDelayMs = Math.min(delay * 2, STANDBY_MAX_RETRY_MS);
    const timer = setTimeout(() => {
      this.standbyTimer = null;
      void this.acquire()
        .catch((error) => {
          logger.error('[chatSearch] projector lease acquisition failed', error);
          return false;
        })
        .then((acquired) => {
          if (!acquired) {
            this.scheduleStandby();
          }
        });
    }, delay);
    timer.unref?.();
    this.standbyTimer = timer;
  }

  /** Tears the loops down without giving up on ever leading again. */
  private async relinquish(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    await this.lease?.release();
    this.lease = null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.standbyTimer) {
      clearTimeout(this.standbyTimer);
      this.standbyTimer = null;
    }
    this.standbyDelayMs = STANDBY_RETRY_MS;
    await this.relinquish();
  }
}
