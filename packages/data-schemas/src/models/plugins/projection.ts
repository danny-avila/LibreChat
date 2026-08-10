import type {
  CallbackWithoutResultAndOptionalError,
  FilterQuery,
  Model,
  Query,
  Schema,
} from 'mongoose';
import type { SearchEventKind, SearchEventOp } from '~/schema/searchevent';
import type { SearchEventInput } from '~/search/events';
import { captureExplicitTemporaryFlag, hasSchemaPath, isUnfinished } from '~/search/document';
import { enqueueSearchEvents, searchEnqueueEnabled } from '~/search/events';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import logger from '~/config/winston';

/**
 * A destination for projected search documents. Sinks never see the write path
 * directly: the search-sync plugin owns every hook, applies the shared guards
 * once, and fans out. `isEnabled` is consulted per call rather than at
 * registration so a flag flip takes effect without a redeploy.
 */
export type SearchSyncOrigin = 'save' | 'updateOne' | 'findOneAndUpdate';

export interface SearchSink {
  readonly name: string;
  isEnabled(): boolean;
  upsert(doc: SearchSyncDocument, origin: SearchSyncOrigin): Promise<void>;
  remove(doc: SearchSyncDocument): Promise<void>;
  removeMany(conditions: FilterQuery<unknown>): Promise<void>;
}

export type SearchSyncDocument = {
  [key: string]: unknown;
  user?: unknown;
  tenantId?: string | null;
  unfinished?: boolean;
};

export type SearchSyncOptions = {
  mongoose: typeof import('mongoose');
  kind: SearchEventKind;
  primaryKey: string;
  sinks?: readonly SearchSink[];
};

/**
 * Cap on how many keys one `deleteMany` fans out into tombstone events. A larger
 * delete is left to the reconciliation sweep rather than turned into an
 * unbounded write amplification on the caller's request.
 */
const DELETE_MANY_EVENT_CAP = 5_000;

/** Model factories are re-entrant; hooks must not stack up on repeat calls. */
const SEARCH_SYNC_APPLIED = Symbol.for('librechat:searchSync');

/** Where a query hands the key it resolved to its own post hook. */
const RESOLVED_KEY = Symbol.for('librechat:searchSyncKey');

/** Where a `deleteMany` hands the keys it resolved to its own post hook. */
const RESOLVED_KEYS = Symbol.for('librechat:searchSyncKeys');

type KeyedQuery = Query<unknown, unknown> & { [RESOLVED_KEY]?: SearchSyncDocument | null };

type ManyKeyedQuery = Query<unknown, unknown> & {
  [RESOLVED_KEYS]?: readonly SearchSyncDocument[];
};

/**
 * Whether a write result says nothing was touched.
 *
 * Query middleware receives the driver's write result, whose shape differs by
 * operation, so it is narrowed rather than typed: an absent count means "cannot
 * tell", which is treated as "something may have changed".
 */
function changedNothing(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) {
    return false;
  }
  if ('matchedCount' in result && result.matchedCount === 0) {
    return true;
  }
  return 'deletedCount' in result && result.deletedCount === 0;
}

/**
 * The tenant the write is actually happening under.
 *
 * `__SYSTEM__` is never copied onto an event: it is a query-time wildcard, not a
 * tenant to store against, so a background write records the base tenant instead.
 */
function tenantFromContext(): string | null {
  const tenantId = getTenantId();
  return tenantId == null || tenantId === SYSTEM_TENANT_ID ? null : tenantId;
}

function toEvent(
  doc: SearchSyncDocument | null | undefined,
  { kind, primaryKey }: Pick<SearchSyncOptions, 'kind' | 'primaryKey'>,
  op: SearchEventOp,
): SearchEventInput | null {
  /**
   * Legacy records can lack the primary key entirely — shared links predating
   * `shareId` are the live case — so the Mongo `_id` stands in. The projection
   * source applies the same fallback, which is what keeps the event key, the
   * tombstone key and the projected record id one identity (pinned by `keys the
   * event by the Mongo _id when the record carries no shareId` and `projects two
   * legacy shared links that carry no shareId as distinct records`).
   */
  const recordId = doc?.[primaryKey] ?? doc?._id;
  const userId = doc?.user;
  if (recordId == null || userId == null) {
    return null;
  }
  return {
    tenantId: typeof doc?.tenantId === 'string' ? doc.tenantId : null,
    userId: String(userId),
    kind,
    recordId: String(recordId),
    op,
  };
}

async function fanOut(
  sinks: readonly SearchSink[],
  action: (sink: SearchSink) => Promise<void>,
): Promise<void> {
  for (const sink of sinks) {
    if (!sink.isEnabled()) {
      continue;
    }
    try {
      await action(sink);
    } catch (error) {
      logger.error(`[searchSync] sink "${sink.name}" failed`, error);
    }
  }
}

/**
 * Registers the projection seam on a schema.
 *
 * Hooks fan **in** to the `searchevents` queue, never out to a search store:
 * request pods enqueue a key and an op, and the lease-holding projector re-reads
 * the authoritative source before writing anywhere. Correctness never rests on
 * these hooks — bulk paths skip Mongoose middleware entirely and TTL deletes run
 * no application code — so the safety poll and the reconciliation sweep remain
 * the load-bearing mechanisms. The hooks only make the common case fast.
 */
export function applySearchSync(schema: Schema, options: SearchSyncOptions): void {
  const guarded = schema as Schema & { [SEARCH_SYNC_APPLIED]?: boolean };
  if (guarded[SEARCH_SYNC_APPLIED]) {
    return;
  }
  guarded[SEARCH_SYNC_APPLIED] = true;

  const { mongoose, kind, primaryKey } = options;
  const sinks = options.sinks ?? [];

  const enqueue = async (
    doc: SearchSyncDocument | null | undefined,
    op: SearchEventOp,
  ): Promise<void> => {
    const event = toEvent(doc, options, op);
    if (!event) {
      return;
    }
    await enqueueSearchEvents(mongoose, [event]);
  };

  const onUpsert = async (
    doc: SearchSyncDocument | null | undefined,
    origin: SearchSyncOrigin,
  ): Promise<void> => {
    if (!doc || isUnfinished(doc)) {
      return;
    }
    await enqueue(doc, 'upsert');
    await fanOut(sinks, (sink) => sink.upsert(doc, origin));
  };

  const run = (
    work: Promise<void>,
    next: CallbackWithoutResultAndOptionalError,
    label: string,
  ): void => {
    work.then(
      () => next(),
      (error) => {
        logger.error(`[searchSync] ${label} hook failed`, error);
        next();
      },
    );
  };

  if (hasSchemaPath(schema, 'isTemporary')) {
    schema.pre('save', function (this: SearchSyncDocument, next) {
      captureExplicitTemporaryFlag(this);
      next();
    });
  }

  schema.post('save', function (doc: SearchSyncDocument, next) {
    run(onUpsert(doc, 'save'), next, 'save');
  });

  /**
   * `updateOne` and `deleteOne` are *query* middleware, so Mongoose hands the post
   * hook the write result rather than the affected document — there is no
   * `{user, primaryKey}` on it, so `toEvent` returned null and these paths
   * enqueued nothing at all. `updateMessageText` is exactly this shape, which
   * meant an edited message never re-projected until the safety poll happened to
   * reach it.
   *
   * The key is therefore resolved from the query itself, before the write runs.
   * Usually it is already in the filter — `Message.updateOne({ messageId, user })`
   * — and costs nothing; only a filter that does not name the record and its owner
   * falls back to a keys-only read. Resolving before rather than after also means
   * a `deleteOne` still has something to look up.
   *
   * These two hooks enqueue and do not fan out. A sink needs a whole document and
   * a write result is not one, so the previous fan-out call here could only ever
   * be a no-op — the Meilisearch plugin has had this same blind spot on
   * `Model.updateOne` since before the queue existed, and `indexSync` is what
   * covers it there. Hydrating and re-indexing on every `Model.updateOne` is a
   * write-path cost that wants measuring on its own rather than riding along here.
   */
  const resolveQueryKey = async (query: KeyedQuery): Promise<SearchSyncDocument | null> => {
    const filter = query.getFilter() as Record<string, unknown>;
    const recordId = filter[primaryKey];
    const userId = filter.user;
    if (typeof recordId === 'string' && typeof userId === 'string') {
      return {
        [primaryKey]: recordId,
        user: userId,
        tenantId: typeof filter.tenantId === 'string' ? filter.tenantId : tenantFromContext(),
      };
    }
    const model = query.model as Model<SearchSyncDocument>;
    return model
      .findOne(filter)
      .select(`${primaryKey} user tenantId`)
      .lean<SearchSyncDocument | null>();
  };

  const captureQueryKey = async (query: KeyedQuery): Promise<void> => {
    query[RESOLVED_KEY] = searchEnqueueEnabled() ? await resolveQueryKey(query) : null;
  };

  schema.pre<KeyedQuery>('updateOne', { document: false, query: true }, function (next) {
    run(captureQueryKey(this), next, 'updateOne key');
  });

  schema.post<KeyedQuery>('updateOne', { document: false, query: true }, function (result, next) {
    const key = this[RESOLVED_KEY];
    const work = changedNothing(result) ? Promise.resolve() : enqueue(key, 'upsert');
    run(work, next, 'updateOne');
  });

  schema.pre<KeyedQuery>('deleteOne', { document: false, query: true }, function (next) {
    run(captureQueryKey(this), next, 'deleteOne key');
  });

  schema.post<KeyedQuery>('deleteOne', { document: false, query: true }, function (result, next) {
    const key = this[RESOLVED_KEY];
    const work = changedNothing(result) ? Promise.resolve() : enqueue(key, 'tombstone');
    run(work, next, 'deleteOne');
  });

  schema.pre<KeyedQuery>('findOneAndUpdate', function (next) {
    run(captureQueryKey(this), next, 'findOneAndUpdate key');
  });

  /**
   * Four result shapes reach this hook. A hydrated Document, a full `.lean()`
   * object, and `saveConvo`'s `includeResultMetadata` wrapper
   * `{ value, ok, lastErrorObject }` all carry the document; a
   * projection-narrowed result — `updateToolCallResult` selects only
   * `unfinished` — carries no key at all. Only the first can be told apart by
   * type, so the rest are told apart by what they hold: a `value` property marks
   * the wrapper, and a document without its primary key falls back to the key
   * captured before the write, exactly as `updateOne` resolves it (pinned by
   * `enqueues through a lean findOneAndUpdate result` and `enqueues through a
   * projection-narrowed lean findOneAndUpdate`). A null result matched nothing
   * and enqueues nothing. The keyless fallback enqueues without the sink fan-out:
   * a sink needs a whole document, which is precisely what that shape lacks.
   *
   * The narrowed shape still carries `_id`, which is deliberately *not* used
   * here: for any record with a real primary key the `_id` is a second identity,
   * and an event keyed by it names a row the projection does not have. The
   * captured key resolves through the same fallback chain as every other path,
   * so it and only it stays consistent.
   */
  schema.post(
    'findOneAndUpdate',
    function (
      res: SearchSyncDocument | { value?: SearchSyncDocument | null } | null,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      let doc: SearchSyncDocument | null;
      if (res instanceof mongoose.Document) {
        doc = res as unknown as SearchSyncDocument;
      } else if (res != null && 'value' in res) {
        doc = (res as { value?: SearchSyncDocument | null }).value ?? null;
      } else {
        doc = res as SearchSyncDocument | null;
      }
      if (doc == null) {
        next();
        return;
      }
      if (doc[primaryKey] != null) {
        run(onUpsert(doc, 'findOneAndUpdate'), next, 'findOneAndUpdate');
        return;
      }
      run(enqueue((this as KeyedQuery)[RESOLVED_KEY], 'upsert'), next, 'findOneAndUpdate');
    },
  );

  const resolveManyKeys = async (query: ManyKeyedQuery): Promise<readonly SearchSyncDocument[]> => {
    const model = query.model as Model<SearchSyncDocument>;
    const docs = await model
      .find(query.getQuery() as FilterQuery<unknown>)
      .select(`${primaryKey} user tenantId`)
      .limit(DELETE_MANY_EVENT_CAP + 1)
      .lean<SearchSyncDocument[]>();

    if (docs.length > DELETE_MANY_EVENT_CAP) {
      logger.warn(
        `[searchSync] deleteMany on ${kind} exceeded ${DELETE_MANY_EVENT_CAP} keys; ` +
          'leaving the remainder to the reconciliation sweep',
      );
    }
    return docs.slice(0, DELETE_MANY_EVENT_CAP);
  };

  /**
   * `deleteMany` never yields documents, so everything that needs them runs
   * before the delete: the affected keys are resolved here (bounded on purpose —
   * past the cap the sweep is cheaper and more reliable than a synchronous
   * fan-out on the caller's request), and the sinks are invoked here, because a
   * sink is a direct writer that re-reads the affected primary keys from Mongo
   * with these conditions and finds nothing once the delete has landed (pinned
   * by `fans deleteMany out to sinks while the documents are still readable` and
   * `deletes each removed document from Meili on deleteMany`).
   */
  schema.pre<ManyKeyedQuery>('deleteMany', function (next) {
    const work = (async () => {
      this[RESOLVED_KEYS] = searchEnqueueEnabled() ? await resolveManyKeys(this) : [];
      await fanOut(sinks, (sink) => sink.removeMany(this.getQuery() as FilterQuery<unknown>));
    })();
    run(work, next, 'deleteMany keys');
  });

  /**
   * The tombstone events wait for the post hook, after the deletion succeeded,
   * exactly as `deleteOne` orders it. Enqueued before the delete, a projector
   * drain landing in that window re-reads the still-live documents, re-upserts
   * them and consumes the events, leaving deleted content projected until
   * reconciliation (pinned by `enqueues deleteMany tombstones only after the
   * deletion is applied`).
   */
  schema.post<ManyKeyedQuery>('deleteMany', function (result, next) {
    const docs = this[RESOLVED_KEYS] ?? [];
    if (docs.length === 0 || changedNothing(result)) {
      next();
      return;
    }
    const events: SearchEventInput[] = [];
    for (const doc of docs) {
      const event = toEvent(doc, options, 'tombstone');
      if (event) {
        events.push(event);
      }
    }
    run(
      enqueueSearchEvents(mongoose, events).then(() => undefined),
      next,
      'deleteMany',
    );
  });
}

export default applySearchSync;
