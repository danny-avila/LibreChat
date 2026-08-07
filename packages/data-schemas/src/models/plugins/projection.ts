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

function toEvent(
  doc: SearchSyncDocument | null | undefined,
  { kind, primaryKey }: Pick<SearchSyncOptions, 'kind' | 'primaryKey'>,
  op: SearchEventOp,
): SearchEventInput | null {
  const recordId = doc?.[primaryKey];
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

  const onRemove = async (doc: SearchSyncDocument | null | undefined): Promise<void> => {
    if (!doc) {
      return;
    }
    await enqueue(doc, 'tombstone');
    await fanOut(sinks, (sink) => sink.remove(doc));
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

  schema.post('updateOne', function (doc: SearchSyncDocument, next) {
    run(onUpsert(doc, 'updateOne'), next, 'updateOne');
  });

  schema.post('deleteOne', function (doc: SearchSyncDocument, next) {
    run(onRemove(doc), next, 'deleteOne');
  });

  /**
   * `saveConvo` issues `findOneAndUpdate` with `includeResultMetadata: true`, so
   * the hook receives the raw `{ value, ok, lastErrorObject }` wrapper instead of
   * the document. Unwrap `value` so the seam covers that path too.
   */
  schema.post(
    'findOneAndUpdate',
    function (
      res: SearchSyncDocument | { value?: SearchSyncDocument | null } | null,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      const doc =
        res instanceof mongoose.Document
          ? (res as unknown as SearchSyncDocument)
          : ((res as { value?: SearchSyncDocument | null } | null)?.value ?? null);
      run(onUpsert(doc, 'findOneAndUpdate'), next, 'findOneAndUpdate');
    },
  );

  /**
   * `deleteMany` never yields documents, so the affected keys are resolved before
   * the delete runs. Bounded on purpose: past the cap the sweep is cheaper and
   * more reliable than a synchronous fan-out on the caller's request.
   */
  schema.pre('deleteMany', function (this: Query<unknown, unknown>, next) {
    const conditions = this.getQuery() as FilterQuery<unknown>;
    const work = (async () => {
      if (searchEnqueueEnabled()) {
        const model = this.model as Model<SearchSyncDocument>;
        const docs = await model
          .find(conditions)
          .select(`${primaryKey} user tenantId`)
          .limit(DELETE_MANY_EVENT_CAP + 1)
          .lean<SearchSyncDocument[]>();

        if (docs.length > DELETE_MANY_EVENT_CAP) {
          logger.warn(
            `[searchSync] deleteMany on ${kind} exceeded ${DELETE_MANY_EVENT_CAP} keys; ` +
              'leaving the remainder to the reconciliation sweep',
          );
        }

        const events: SearchEventInput[] = [];
        for (const doc of docs.slice(0, DELETE_MANY_EVENT_CAP)) {
          const event = toEvent(doc, options, 'tombstone');
          if (event) {
            events.push(event);
          }
        }
        await enqueueSearchEvents(mongoose, events);
      }
      await fanOut(sinks, (sink) => sink.removeMany(conditions));
    })();
    run(work, next, 'deleteMany');
  });
}

export default applySearchSync;
