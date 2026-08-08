import {
  runAsSystem,
  flattenContent,
  normalizeTenantId,
  normalizeSearchText,
  effectiveTemporaryFlag,
} from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import type { ProjectionSource, SearchKind, SearchRecordKey } from './types';

/**
 * Position in the `(updatedAt, recordId)` scan.
 *
 * `updatedAt` is nullable because the collection contains records that have none:
 * imports preserve historic or absent timestamps, and Mongo sorts a missing field
 * ahead of every date. A cursor that cannot represent "still inside the
 * untimestamped region" cannot leave it — the scan returns the same first page
 * forever and never reaches anything with a timestamp at all.
 */
export type SourceCursor = Readonly<{
  updatedAt: Date | null;
  recordId: string;
}>;

export type ScanPage = Readonly<{
  sources: readonly ProjectionSource[];
  cursor: SourceCursor | null;
}>;

/**
 * The projector's view of the primary store.
 *
 * Expressed as an interface so the drain, the safety poll and the reconciliation
 * sweep can be exercised against a real MongoDB without dragging the whole model
 * layer into the projector, and so a future FerretDB or native-PostgreSQL source
 * is a swap rather than a rewrite.
 */
export interface ProjectionSourceReader {
  /** Authoritative state for specific keys. Missing keys are simply absent. */
  read(kind: SearchKind, keys: readonly SearchRecordKey[]): Promise<readonly ProjectionSource[]>;
  /**
   * Keyset scan for the safety poll, ordered by `(updatedAt, recordId)`.
   *
   * The resume predicate must carry the record id as well as the timestamp. A bare
   * `updatedAt > T` silently drops every row sharing the boundary instant, which
   * bulk writes produce constantly — and a page that ends on a row with no
   * timestamp at all must still advance, or the scan never leaves the imported
   * records at the head of the collection.
   */
  scan(kind: SearchKind, from: SourceCursor | null, limit: number): Promise<ScanPage>;
  /** Every live key for one kind, for set-diff reconciliation. */
  keys(kind: SearchKind, batchSize: number): AsyncGenerator<readonly SearchRecordKey[]>;
}

type MongoModels = {
  Message: Model<Record<string, unknown>>;
  Conversation: Model<Record<string, unknown>>;
  SharedLink: Model<Record<string, unknown>>;
};

const KIND_MODEL: Readonly<Record<SearchKind, keyof MongoModels>> = Object.freeze({
  message: 'Message',
  conversation: 'Conversation',
  'shared-link': 'SharedLink',
});

const KIND_ID: Readonly<Record<SearchKind, string>> = Object.freeze({
  message: 'messageId',
  conversation: 'conversationId',
  'shared-link': 'shareId',
});

function asDate(value: unknown): Date | null {
  return value instanceof Date ? value : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Where the `(updatedAt, recordId)` scan resumes.
 *
 * Two shapes, because the sort has two regions. Inside the untimestamped region
 * the tiebreak is the record id alone, and the predicate must also admit
 * everything that *does* carry a timestamp so the scan can leave that region at
 * all. `{ updatedAt: null }` matches a stored null and an absent field alike,
 * which is exactly the set being paged.
 */
function scanResumeFilter(id: string, from: SourceCursor | null): Record<string, unknown> {
  if (from == null) {
    return {};
  }
  if (from.updatedAt == null) {
    return {
      $or: [{ updatedAt: null, [id]: { $gt: from.recordId } }, { updatedAt: { $ne: null } }],
    };
  }
  return {
    $or: [
      { updatedAt: { $gt: from.updatedAt } },
      { updatedAt: from.updatedAt, [id]: { $gt: from.recordId } },
    ],
  };
}

/**
 * Flattens one source document into the projected shape.
 *
 * Message bodies come from the `content` array when present — the same
 * `parseTextParts` flattening the search sinks have always applied, including
 * steered words — falling back to the legacy `text` field.
 *
 * Title and body are normalized here, on the write side, because the query path
 * normalizes too. Store the raw form and a full-width identifier is compared
 * against its NFKC-folded query: PostgreSQL's exact, trigram and simple-FTS
 * operators do not reverse that folding, so searching the visibly identical text
 * misses every lexical arm. One normalization, applied on both sides.
 *
 * The temporary flag is *derived* rather than copied. `isTemporary` is absent on
 * legacy records, and reading absence as an explicit `false` makes a record with
 * a future `expiredAt` searchable in PostgreSQL that primary-store hydration then
 * refuses — so it consumes a slot in the bounded candidate set and hides a real
 * match ranked below it.
 */
export function toProjectionSource(
  kind: SearchKind,
  doc: Record<string, unknown>,
): ProjectionSource {
  const recordId = asString(doc[KIND_ID[kind]]);
  const body = kind === 'message' ? (flattenContent(doc.content) ?? asString(doc.text)) : '';

  return {
    tenantId: normalizeTenantId(doc.tenantId as string | null | undefined),
    userId: asString(doc.user),
    kind,
    recordId,
    conversationId: typeof doc.conversationId === 'string' ? doc.conversationId : null,
    title: normalizeSearchText(asString(doc.title)),
    body: normalizeSearchText(body),
    tags: Array.isArray(doc.tags)
      ? doc.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    isArchived: doc.isArchived === true,
    projectId: typeof doc.chatProjectId === 'string' ? doc.chatProjectId : null,
    isTemporary: effectiveTemporaryFlag({
      isTemporary: doc.isTemporary as boolean | null | undefined,
      expiredAt: asDate(doc.expiredAt),
    }),
    sourceCreatedAt: asDate(doc.createdAt),
    sourceUpdatedAt: asDate(doc.updatedAt),
    expiresAt: asDate(doc.expiredAt),
    unfinished: doc.unfinished === true,
  };
}

const PROJECTION_FIELDS =
  'messageId conversationId shareId user tenantId title text content tags isArchived ' +
  'chatProjectId isTemporary expiredAt unfinished createdAt updatedAt';

/**
 * The projector is a cross-tenant background consumer: it reads every tenant's
 * records and writes each one back under the scope the document itself carries.
 * `Message`, `Conversation` and `SharedLink` are tenant-isolated, so under
 * `TENANT_ISOLATION_STRICT` every one of these reads is rejected outright unless
 * it declares that intent — which would leave PostgreSQL permanently empty on
 * exactly the deployments that most need isolation to hold.
 *
 * Declared here, at the one boundary that touches the tenant-isolated models,
 * rather than around the projector's timers: a source read is a source read
 * whether the drain, the poll or the sweep asked for it, and a wrapper further
 * out is one refactor away from no longer covering all three.
 */
export function createMongoSourceReader(
  mongoose: typeof import('mongoose'),
): ProjectionSourceReader {
  const modelFor = (kind: SearchKind): Model<Record<string, unknown>> => {
    const model = mongoose.models[KIND_MODEL[kind]] as Model<Record<string, unknown>> | undefined;
    if (!model) {
      throw new Error(`[chatSearch] model ${KIND_MODEL[kind]} is not registered`);
    }
    return model;
  };

  return {
    async read(kind, keys) {
      if (keys.length === 0) {
        return [];
      }
      const model = modelFor(kind);
      const docs = await runAsSystem(() =>
        model
          .find({ [KIND_ID[kind]]: { $in: keys.map((key) => key.recordId) } })
          .select(PROJECTION_FIELDS)
          .lean<Array<Record<string, unknown>>>()
          .exec(),
      );

      /**
       * The event carries the scope the writer observed; the document carries
       * the scope of record. Only rows whose owner still matches the requested
       * key are returned, so a recycled record id cannot project one user's
       * content under another's scope.
       */
      const wanted = new Set(
        keys.map((key) => `${normalizeTenantId(key.tenantId)}${key.userId}${key.recordId}`),
      );
      const sources: ProjectionSource[] = [];
      for (const doc of docs) {
        const source = toProjectionSource(kind, doc);
        if (wanted.has(`${source.tenantId}${source.userId}${source.recordId}`)) {
          sources.push(source);
        }
      }
      return sources;
    },

    async scan(kind, from, limit) {
      const model = modelFor(kind);
      const id = KIND_ID[kind];
      const filter = scanResumeFilter(id, from);

      const docs = await runAsSystem(() =>
        model
          .find(filter)
          .select(PROJECTION_FIELDS)
          .sort({ updatedAt: 1, [id]: 1 })
          .limit(limit)
          .lean<Array<Record<string, unknown>>>()
          .exec(),
      );

      const sources = docs.map((doc) => toProjectionSource(kind, doc));
      const last = sources[sources.length - 1];
      /**
       * The cursor advances on the record id even when the page ended on an
       * untimestamped row. Returning the previous cursor there — the only way to
       * express "no timestamp" before this type was nullable — is what made a full
       * page of imported records reread itself forever.
       */
      return {
        sources,
        cursor: last
          ? { updatedAt: last.sourceUpdatedAt, recordId: last.recordId }
          : (from ?? null),
      };
    },

    /**
     * Paged on `_id`, which is a total order over the collection.
     *
     * The record id is not one: the Mongo uniqueness constraints include user and
     * tenant, so two users importing the same export legitimately hold two
     * documents with a single conversation id. Resuming on `recordId > cursor`
     * therefore drops every member of such a group after a batch boundary — and
     * permanently, because reconciliation is the layer that would otherwise have
     * found them. `_id` is unique, always present, ordered, and served by the
     * index every collection already has, so nothing can fall between two pages.
     */
    async *keys(kind, batchSize) {
      const model = modelFor(kind);
      const id = KIND_ID[kind];
      let cursor: unknown = null;
      for (;;) {
        const filter = cursor == null ? {} : { _id: { $gt: cursor } };
        const docs = await runAsSystem(() =>
          model
            .find(filter)
            .select(`_id ${id} user tenantId`)
            .sort({ _id: 1 })
            .limit(batchSize)
            .lean<Array<Record<string, unknown>>>()
            .exec(),
        );

        if (docs.length === 0) {
          return;
        }
        yield docs.map((doc) => ({
          tenantId: normalizeTenantId(doc.tenantId as string | null | undefined),
          userId: asString(doc.user),
          kind,
          recordId: asString(doc[id]),
        }));
        cursor = docs[docs.length - 1]._id;
      }
    },
  };
}
