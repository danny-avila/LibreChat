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
import type { ProjectedKey } from './writer';
import type { Lease } from './lease';
import {
  DEFAULT_EMBEDDING_SPACE,
  DRAIN_INTERVAL_MS,
  OUTBOX_RETENTION_HOURS,
  SAFETY_POLL_INTERVAL_MS,
  SAFETY_POLL_LOOKBACK_MS,
  STANDBY_MAX_RETRY_MS,
  STANDBY_RETRY_MS,
  SWEEP_INTERVAL_MS,
} from './constants';
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
import { acquireLease, assertLeaseEpoch } from './lease';
import { withTransaction } from './pool';
import { contentHash } from './hash';

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
  /**
   * Run one pass of all three layers as soon as leadership is won, rather than
   * waiting out the first interval. On by default, and off in specs that drive
   * the layers by hand — a background pass consuming the queue would race their
   * assertions about what one explicit `drain()` did.
   */
  startupCatchUp?: boolean;
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
  private readonly startupCatchUp: boolean;

  private lease: Lease | null = null;
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private stopped = false;
  private standbyTimer: NodeJS.Timeout | null = null;
  private standbyDelayMs = STANDBY_RETRY_MS;
  /**
   * Serializes full reconciliation across its two entry paths — the interval
   * timer and the untracked startup catch-up. The timer's own `inFlight` flag
   * only covers invocations it started itself, so on an install whose first
   * full pass outlasts `sweepMs` the timer would otherwise begin a second
   * complete scan concurrently (pinned by `does not start a second
   * reconciliation while one is in flight`).
   */
  private reconciling = false;
  /**
   * Per kind: where a scan pass still in progress resumes.
   *
   * Held in memory rather than persisted, because the stored cursor only ever
   * advances (see `writePollCursor`): a fresh pass re-enters the trailing
   * lookback window *behind* the persisted high-water mark, and once that window
   * holds more than one page, the rewound page's end position is refused by the
   * forward-only guard. Resuming from this map keeps the pass walking the window
   * to completion instead of snapping back to the high-water mark and skipping
   * the window's tail (pinned by `finishes a multi-page lookback window instead
   * of snapping back to the high-water mark`). Cleared once a pass catches up —
   * the next pass starts fresh and overlaps again — and lost with the process or
   * the lease, which only costs an idempotent re-scan.
   */
  private readonly scanResume = new Map<SearchKind, SourceCursor>();

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
    this.startupCatchUp = deps.startupCatchUp ?? true;
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
   *
   * `sourceReadAt` is when that read happened, and it travels with the write. The
   * per-record lock is taken inside the transaction below, *after* the source was
   * read, so the lock alone cannot decide which of two overlapping passes holds
   * the newer truth; the read instant can, and does.
   */
  private async applyOne(
    client: SearchClient,
    epoch: number,
    key: SearchRecordKey,
    source: ProjectionSource | undefined,
    sourceReadAt: Date,
  ): Promise<'projected' | 'tombstoned' | 'skipped'> {
    /**
     * An absent source is a deletion; an *unfinished* source is treated the same
     * way. Partial assistant rows are rewritten at finalize, so projecting one
     * makes a half-written generation searchable and embeds the same turn twice
     * — and a record that was projected before it reopened (resume, HITL) must
     * not keep serving its old text either. `tombstoneDocument` is a conditional
     * UPDATE: it buries an existing row and creates nothing for a record that
     * was never projected, which matters because streaming holds an unfinished
     * row per in-flight message (pinned by `tombstones a projected message that
     * reopens as unfinished, then revives it at finalize` and `never projects an
     * unfinished assistant row, and projects it once finalized`).
     */
    if (!source || source.unfinished) {
      const result = await tombstoneDocument(client, epoch, key, new Date(), sourceReadAt);
      return result.applied ? 'tombstoned' : 'skipped';
    }
    const result = await upsertDocument(client, epoch, source, this.space, sourceReadAt);
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

      const readAt = new Date();
      const sources = await this.deps.source.read(kind, live);
      const byKey = new Map(sources.map((source) => [recordKeyString(source), source]));

      for (const event of live) {
        try {
          const outcome = await withTransaction(this.deps.pool, (client) =>
            this.applyOne(client, epoch, event, byKey.get(recordKeyString(event)), readAt),
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
   * A pass still in progress resumes from its in-memory position, so the
   * persisted cursor is only consulted when a fresh pass begins — and a fresh
   * pass always applies the lookback overlap. `updatedAt` is generated
   * application side, so cross-pod clock skew plus read-before-commit visibility
   * means a write stamped `T - epsilon` can land after the scan passed `T`;
   * re-scanning that window with idempotent upserts is what makes such a row
   * recoverable.
   */
  private async readPollCursor(kind: SearchKind): Promise<SourceCursor | null> {
    const resume = this.scanResume.get(kind);
    if (resume) {
      return resume;
    }
    const { rows } = await this.deps.pool.query<{
      updated_at: Date | null;
      record_id: string | null;
      mongo_id: string | null;
    }>('SELECT updated_at, record_id, mongo_id FROM chat_search.poll_cursor WHERE kind = $1', [
      kind,
    ]);
    const row = rows[0];
    if (!row || row.record_id == null) {
      return null;
    }
    /**
     * A stored null timestamp is a real position, not an absent one: it means the
     * scan is still inside the region of records that carry no `updatedAt` at all.
     * Reading it as "no cursor" would restart that region from its beginning on
     * every pass and never reach a timestamped record.
     */
    if (row.updated_at == null) {
      return { updatedAt: null, recordId: row.record_id, id: row.mongo_id ?? '' };
    }
    /**
     * An empty record id makes the keyset tiebreak match everything at the
     * rewound instant, so the overlap window is entered whole rather than
     * clipped by a record id that belongs to a different timestamp.
     */
    return {
      updatedAt: new Date(row.updated_at.getTime() - this.lookbackMs),
      recordId: '',
      id: '',
    };
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
      /**
       * `-infinity` stands in for the untimestamped region so the row comparison
       * stays total. A literal NULL in a row comparison yields NULL, the guard
       * fails, and the cursor would never advance out of that region at all.
       * `mongo_id` is the third keyset component: record ids are only unique per
       * user and tenant, so a page boundary inside an equal `(updated_at,
       * record_id)` group needs it to advance without skipping the rest of the
       * group.
       */
      `INSERT INTO chat_search.poll_cursor (kind, updated_at, record_id, mongo_id, scanned_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (kind) DO UPDATE SET
         updated_at = excluded.updated_at,
         record_id = excluded.record_id,
         mongo_id = excluded.mongo_id,
         scanned_at = now()
       WHERE (COALESCE(excluded.updated_at, '-infinity'::timestamptz), excluded.record_id,
              excluded.mongo_id)
           > (COALESCE(chat_search.poll_cursor.updated_at, '-infinity'::timestamptz),
              chat_search.poll_cursor.record_id, chat_search.poll_cursor.mongo_id)`,
      [kind, cursor.updatedAt, cursor.recordId, cursor.id],
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
      const readAt = new Date();
      const page = await this.deps.source.scan(kind, from, this.scanBatch);
      /**
       * A short page means this pass drained the backlog: the next poll starts a
       * fresh pass and re-enters the overlap window. A full page keeps the pass
       * alive at its in-memory position, which the persisted cursor cannot carry
       * while the pass is still inside the overlap window behind it.
       */
      if (page.sources.length < this.scanBatch) {
        this.scanResume.delete(kind);
      } else if (page.cursor) {
        this.scanResume.set(kind, page.cursor);
      }
      if (page.sources.length === 0) {
        continue;
      }

      for (const source of page.sources) {
        try {
          const result = await withTransaction(this.deps.pool, async (client) => {
            /**
             * An unfinished source must not stay searchable under its old text:
             * `tombstoneDocument` is a conditional UPDATE, so a record that was
             * projected before it reopened is buried, and one that was never
             * projected — every in-flight streaming message — creates no row
             * (pinned by `buries a reopened message the poll discovers without
             * creating rows for in-flight ones`).
             */
            if (source.unfinished) {
              return tombstoneDocument(client, epoch, source, new Date(), readAt);
            }
            const outcome = await upsertDocument(client, epoch, source, this.space, readAt);
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
   * Walks the projection and makes each window agree with the source.
   *
   * Three repairs, from one read. Keys the source no longer has are tombstoned;
   * live rows whose source has reopened as unfinished are tombstoned too; and
   * rows whose stored `content_hash` no longer matches the source are re-projected
   * — the last is what makes reconciliation a repair rather than only an
   * add-and-remove. A re-import that overwrites an existing conversation carries a
   * historic `updatedAt`, so it sorts behind the forward poll cursor forever, and
   * the row is present in the projection, so no backfill claims it either: without
   * a content comparison the old title and body stay searchable indefinitely.
   *
   * Comparing hashes in memory rather than simply re-upserting every row is the
   * difference between a few writes an hour and ten million.
   *
   * Bounded either way: the walk pages the projection and asks the source about
   * exactly that page, so neither process memory nor any statement's parameters
   * scale with an install's size.
   *
   * The version snapshot is taken before the walk begins, so a record projected
   * while the walk is in flight is never treated as missing.
   */
  private async reconcileWindows(
    kind: SearchKind,
    epoch: number,
    snapshot: number,
  ): Promise<{ tombstoned: number; refreshed: number }> {
    let tombstoned = 0;
    let refreshed = 0;
    let after: SearchRecordKey | null = null;

    for (;;) {
      const window: readonly ProjectedKey[] = await withTransaction(this.deps.pool, (client) =>
        scanProjectedKeys(client, kind, after, this.reconcileBatch),
      );
      if (window.length === 0) {
        return { tombstoned, refreshed };
      }

      try {
        const readAt = new Date();
        const sources = await this.deps.source.read(kind, window);
        const byKey = new Map(sources.map((source) => [recordKeyString(source), source]));

        const missing: SearchRecordKey[] = [];
        const drifted: ProjectionSource[] = [];
        const reopened: ProjectionSource[] = [];
        for (const key of window) {
          const source = byKey.get(recordKeyString(key));
          if (!source) {
            missing.push(key);
            continue;
          }
          /**
           * The window holds only live rows, so an unfinished source here is a
           * *reopened* record: it was projected once and its old text is still
           * searchable. Buried like a deletion — never left in place — and the
           * finalize upsert revives it (pinned by `buries a reopened message
           * reconciliation finds behind the poll cursor`).
           */
          if (source.unfinished) {
            reopened.push(source);
            continue;
          }
          if (contentHash(source) !== key.contentHash) {
            drifted.push(source);
          }
        }

        tombstoned += await withTransaction(this.deps.pool, (client) =>
          sweepMissing(client, epoch, kind, snapshot, missing, new Date(), readAt),
        );
        tombstoned += await this.tombstoneReopened(reopened, epoch, readAt);
        refreshed += await this.project(drifted, epoch, readAt, 'refresh a drifted record');
      } catch (error) {
        logger.error('[chatSearch] reconciliation failed for a key window', error);
      }

      /**
       * Resume past the window just examined rather than re-reading from the
       * start: a tombstoned row leaves the live set, but a retained one would
       * otherwise be handed back forever.
       */
      if (window.length < this.reconcileBatch) {
        return { tombstoned, refreshed };
      }
      after = window[window.length - 1];
    }
  }

  /** Buries live rows whose source has reopened, one transaction at a time. */
  private async tombstoneReopened(
    sources: readonly ProjectionSource[],
    epoch: number,
    sourceReadAt: Date,
  ): Promise<number> {
    let applied = 0;
    for (const source of sources) {
      try {
        const result = await withTransaction(this.deps.pool, (client) =>
          tombstoneDocument(client, epoch, source, new Date(), sourceReadAt),
        );
        if (result.applied) {
          applied++;
        }
      } catch (error) {
        logger.error('[chatSearch] reconciliation failed to bury a reopened record', error);
      }
    }
    return applied;
  }

  /** Upserts a batch one transaction at a time, counting what actually landed. */
  private async project(
    sources: readonly ProjectionSource[],
    epoch: number,
    sourceReadAt: Date,
    what: string,
  ): Promise<number> {
    let applied = 0;
    for (const source of sources) {
      try {
        const result = await withTransaction(this.deps.pool, async (client) => {
          const outcome = await upsertDocument(client, epoch, source, this.space, sourceReadAt);
          /**
           * For a record outside the safety poll's moving window — historic and
           * untimestamped imports above all — reconciliation is the only path
           * that ever re-reads it, so it must clear the failure row the same way
           * the poll does. Left in place, a quarantine outlives the repair and
           * the drain keeps discarding every later event for the record (pinned
           * by `clears a quarantine once reconciliation repairs the record`).
           */
          await clearFailure(client, source);
          return outcome;
        });
        if (result.applied) {
          applied++;
        }
      } catch (error) {
        logger.error(`[chatSearch] reconciliation failed to ${what}`, error);
      }
    }
    return applied;
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

      const readAt = new Date();
      const sources = await this.deps.source.read(kind, missing);
      projected += await this.project(
        sources.filter((source) => !source.unfinished),
        epoch,
        readAt,
        'backfill a record',
      );
    }

    return projected;
  }

  /**
   * Time-based outbox retention. Nothing else deletes outbox rows — both writer
   * sites only insert — so without this trim the table grows without bound.
   * Rows are dropped purely by age, whether or not a downstream target has
   * applied them (pinned by `trims outbox rows past the retention window and
   * keeps the rest`); `outbox_enqueued_idx` keeps the delete a range scan.
   */
  private async trimOutbox(epoch: number): Promise<number> {
    return withTransaction(this.deps.pool, async (client) => {
      await assertLeaseEpoch(client, epoch);
      const result = await client.query(
        `DELETE FROM chat_search.outbox
          WHERE enqueued_at < now() - make_interval(hours => $1)`,
        [OUTBOX_RETENTION_HOURS],
      );
      return result.rowCount ?? 0;
    });
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
    if (this.reconciling) {
      return 0;
    }
    this.reconciling = true;

    try {
      let tombstoned = 0;
      for (const kind of KINDS) {
        const snapshot = await withTransaction(this.deps.pool, (client) =>
          currentVersionSnapshot(client),
        );

        const walk = await this.reconcileWindows(kind, epoch, snapshot);
        tombstoned += walk.tombstoned;
        if (walk.refreshed > 0) {
          logger.info(
            `[chatSearch] reconciliation refreshed ${walk.refreshed} drifted ${kind} rows`,
          );
        }

        const backfilled = await this.backfillMissing(kind, epoch);
        if (backfilled > 0) {
          logger.info(`[chatSearch] reconciliation backfilled ${backfilled} ${kind} records`);
        }
      }

      const trimmed = await this.trimOutbox(epoch);
      if (trimmed > 0) {
        logger.info(`[chatSearch] trimmed ${trimmed} outbox rows past the retention window`);
      }
      return tombstoned;
    } finally {
      this.reconciling = false;
    }
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
    /**
     * `setInterval` does not fire until a whole interval has elapsed, so without
     * this a first rollout against an existing database serves an almost empty
     * index for an hour: nothing has queued an event, the poll starts at the
     * oldest rows and advances 500 a minute, and reconciliation — the only layer
     * that can find the rest — has not run at all. Unawaited, because a full
     * reconciliation of a large install must not hold up the process's boot.
     */
    if (this.startupCatchUp) {
      void this.catchUp();
    }
    /**
     * A renewal that *throws* — the dedicated lease connection was interrupted —
     * is treated exactly like one that returns false. Left to the generic
     * scheduler's catch, the pod would stay marked running with a dead lease and
     * never attempt a fresh connection, stopping projection permanently on a
     * single-pod deployment (pinned by `re-enters standby and re-acquires after
     * a lease renewal failure`). The relinquish is best-effort for the same
     * reason the renewal failed; standby re-acquisition opens a new connection.
     */
    this.schedule(
      async () => {
        let held: boolean | undefined;
        try {
          held = await this.lease?.renew();
        } catch (error) {
          logger.warn('[chatSearch] projector lease renewal failed; standing by', error);
          held = false;
        }
        if (held === false) {
          logger.warn('[chatSearch] projector lease lost; standing by');
          await this.relinquish().catch((error) =>
            logger.warn('[chatSearch] projector teardown failed after a lost lease', error),
          );
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

  /**
   * One immediate pass of every layer, cheapest first.
   *
   * Ordered so the fast paths cannot be starved by the slow one, and each step
   * checks it is still the leader — a lease lost mid-reconciliation must not have
   * its remaining work committed under a stale epoch.
   */
  private async catchUp(): Promise<void> {
    for (const [label, run] of [
      ['drain', () => this.drain()],
      ['safety poll', () => this.safetyPoll()],
      ['reconciliation', () => this.reconcile()],
    ] as const) {
      if (!this.running) {
        return;
      }
      try {
        await run();
      } catch (error) {
        logger.error(`[chatSearch] startup ${label} failed`, error);
      }
    }
  }

  /**
   * Tears the loops down without giving up on ever leading again. The lease slot
   * is cleared before the release is awaited, so a release rejected by a broken
   * connection still leaves this pod a clean standby rather than a phantom
   * leader.
   */
  private async relinquish(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.scanResume.clear();
    const lease = this.lease;
    this.lease = null;
    await lease?.release();
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
