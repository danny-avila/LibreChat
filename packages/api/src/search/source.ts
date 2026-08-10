import {
  runAsSystem,
  flattenContent,
  normalizeTenantId,
  normalizeSearchText,
  effectiveTemporaryFlag,
} from '@librechat/data-schemas';
import type { IConversation, IMessage, ISharedLink } from '@librechat/data-schemas';
import type { FilterQuery, Model, Types } from 'mongoose';
import type { ProjectionSource, SearchKind, SearchRecordKey } from './types';

/**
 * Position in the `(updatedAt, recordId, _id)` scan.
 *
 * `updatedAt` is nullable because the collection contains records that have none:
 * imports preserve historic or absent timestamps, and Mongo sorts a missing field
 * ahead of every date. A cursor that cannot represent "still inside the
 * untimestamped region" cannot leave it — the scan returns the same first page
 * forever and never reaches anything with a timestamp at all.
 *
 * `id` is the Mongo `_id` of the last row read, as its hex string, and it is the
 * component that makes the position globally unique: record ids are only unique
 * together with user and tenant, so an equal `(updatedAt, recordId)` group —
 * two users importing the same export — can span a page boundary, and a resume
 * without the tiebreak skips every unreturned member of the group (pinned by
 * `walks an equal-timestamp duplicate-id group without skipping members`).
 * Empty means "no tiebreak": resume admits the whole equal-key group.
 */
export type SourceCursor = Readonly<{
  updatedAt: Date | null;
  recordId: string;
  id: string;
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

/**
 * A lean source document as the projector reads it: the union of the projected
 * fields across the three kinds, each keeping its schema type. `.lean()` skips
 * hydration, so every field is optional — legacy and imported documents are
 * missing several — and the accessors below narrow at runtime rather than trust
 * the declaration.
 */
export type SourceDocument = Partial<
  Pick<
    IMessage,
    | 'messageId'
    | 'conversationId'
    | 'user'
    | 'tenantId'
    | 'text'
    | 'content'
    | 'unfinished'
    | 'isTemporary'
    | 'expiredAt'
    | 'createdAt'
    | 'updatedAt'
  > &
    Pick<IConversation, 'title' | 'tags' | 'isArchived' | 'chatProjectId'> &
    Pick<ISharedLink, 'shareId'>
> & { _id?: Types.ObjectId };

type SourceModelName = 'Message' | 'Conversation' | 'SharedLink';
type SourceIdField = 'messageId' | 'conversationId' | 'shareId';

const KIND_MODEL: Readonly<Record<SearchKind, SourceModelName>> = Object.freeze({
  message: 'Message',
  conversation: 'Conversation',
  'shared-link': 'SharedLink',
});

const KIND_ID: Readonly<Record<SearchKind, SourceIdField>> = Object.freeze({
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
 * Where the `(updatedAt, recordId, _id)` scan resumes.
 *
 * Two shapes, because the sort has two regions. Inside the untimestamped region
 * the tiebreak is the record id alone, and the predicate must also admit
 * everything that *does* carry a timestamp so the scan can leave that region at
 * all. `{ updatedAt: null }` matches a stored null and an absent field alike,
 * which is exactly the set being paged.
 *
 * Each region carries the `_id` arm as its final tiebreak: `_id` is globally
 * unique where the record id is not, so a page ending inside an equal-key group
 * resumes with the group's unreturned members instead of skipping them.
 */
function scanResumeFilter(
  id: SourceIdField,
  from: SourceCursor | null,
  toObjectId: (hex: string) => Types.ObjectId,
): FilterQuery<SourceDocument> {
  if (from == null) {
    return {};
  }
  const idArm = (shared: FilterQuery<SourceDocument>): FilterQuery<SourceDocument>[] =>
    from.id === '' ? [] : [{ ...shared, [id]: from.recordId, _id: { $gt: toObjectId(from.id) } }];
  if (from.updatedAt == null) {
    return {
      $or: [
        { updatedAt: null, [id]: { $gt: from.recordId } },
        ...idArm({ updatedAt: null }),
        { updatedAt: { $ne: null } },
      ],
    };
  }
  return {
    $or: [
      { updatedAt: { $gt: from.updatedAt } },
      { updatedAt: from.updatedAt, [id]: { $gt: from.recordId } },
      ...idArm({ updatedAt: from.updatedAt }),
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
export function toProjectionSource(kind: SearchKind, doc: SourceDocument): ProjectionSource {
  const recordId = asString(doc[KIND_ID[kind]]);
  const body = kind === 'message' ? (flattenContent(doc.content) ?? asString(doc.text)) : '';

  return {
    tenantId: normalizeTenantId(doc.tenantId),
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
      isTemporary: doc.isTemporary,
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
  const modelFor = (kind: SearchKind): Model<SourceDocument> => {
    const model = mongoose.models[KIND_MODEL[kind]] as Model<SourceDocument> | undefined;
    if (!model) {
      throw new Error(`[chatSearch] model ${KIND_MODEL[kind]} is not registered`);
    }
    return model;
  };
  const toObjectId = (hex: string): Types.ObjectId => new mongoose.Types.ObjectId(hex);

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
          .lean<SourceDocument[]>()
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
      const filter = scanResumeFilter(id, from, toObjectId);

      const docs = await runAsSystem(() =>
        model
          .find(filter)
          .select(PROJECTION_FIELDS)
          .sort({ updatedAt: 1, [id]: 1, _id: 1 })
          .limit(limit)
          .lean<SourceDocument[]>()
          .exec(),
      );

      const sources = docs.map((doc) => toProjectionSource(kind, doc));
      const last = sources[sources.length - 1];
      const lastId = docs[docs.length - 1]?._id;
      /**
       * The cursor advances on the record id even when the page ended on an
       * untimestamped row. Returning the previous cursor there — the only way to
       * express "no timestamp" before this type was nullable — is what made a full
       * page of imported records reread itself forever.
       */
      return {
        sources,
        cursor: last
          ? {
              updatedAt: last.sourceUpdatedAt,
              recordId: last.recordId,
              id: lastId ? String(lastId) : '',
            }
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
      let cursor: Types.ObjectId | null = null;
      for (;;) {
        const filter: FilterQuery<SourceDocument> = cursor == null ? {} : { _id: { $gt: cursor } };
        const docs = await runAsSystem(() =>
          model
            .find(filter)
            .select(`_id ${id} user tenantId`)
            .sort({ _id: 1 })
            .limit(batchSize)
            .lean<SourceDocument[]>()
            .exec(),
        );

        if (docs.length === 0) {
          return;
        }
        yield docs.map((doc) => ({
          tenantId: normalizeTenantId(doc.tenantId),
          userId: asString(doc.user),
          kind,
          recordId: asString(doc[id]),
        }));
        const lastId = docs[docs.length - 1]._id;
        if (!lastId) {
          return;
        }
        cursor = lastId;
      }
    },
  };
}
