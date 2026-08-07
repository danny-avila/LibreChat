import { flattenContent, normalizeTenantId, runAsSystem } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import type { ProjectionSource, SearchKind, SearchRecordKey } from './types';

/**
 * The projector's view of the primary store.
 *
 * Expressed as an interface so the drain, the safety poll and the reconciliation
 * sweep can be exercised against a real MongoDB without dragging the whole
 * model layer into the projector, and so a future FerretDB or native-PostgreSQL
 * source is a swap rather than a rewrite.
 */
export type SourceCursor = Readonly<{
  updatedAt: Date;
  recordId: string;
}>;

export type ScanPage = Readonly<{
  sources: readonly ProjectionSource[];
  cursor: SourceCursor | null;
}>;

export interface ProjectionSourceReader {
  /** Authoritative state for specific keys. Missing keys are simply absent. */
  read(kind: SearchKind, keys: readonly SearchRecordKey[]): Promise<readonly ProjectionSource[]>;
  /**
   * Keyset scan for the safety poll, ordered `(updatedAt, _id)`.
   *
   * The resume predicate must be `(updatedAt > T) OR (updatedAt = T AND _id >
   * lastId)`. A bare `updatedAt > T` silently drops every row sharing the
   * boundary timestamp, which bulk writes produce constantly.
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
 * Flattens one source document into the projected shape.
 *
 * Message bodies come from the `content` array when present — the same
 * `parseTextParts` flattening the search sinks have always applied, including
 * steered words — falling back to the legacy `text` field.
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
    title: asString(doc.title),
    body,
    tags: Array.isArray(doc.tags)
      ? doc.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    isArchived: doc.isArchived === true,
    projectId: typeof doc.chatProjectId === 'string' ? doc.chatProjectId : null,
    isTemporary: doc.isTemporary === true,
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
      const filter =
        from == null
          ? {}
          : {
              $or: [
                { updatedAt: { $gt: from.updatedAt } },
                { updatedAt: from.updatedAt, [KIND_ID[kind]]: { $gt: from.recordId } },
              ],
            };

      const docs = await runAsSystem(() =>
        model
          .find(filter)
          .select(PROJECTION_FIELDS)
          .sort({ updatedAt: 1, [KIND_ID[kind]]: 1 })
          .limit(limit)
          .lean<Array<Record<string, unknown>>>()
          .exec(),
      );

      const sources = docs.map((doc) => toProjectionSource(kind, doc));
      const last = sources[sources.length - 1];
      return {
        sources,
        cursor:
          last && last.sourceUpdatedAt
            ? { updatedAt: last.sourceUpdatedAt, recordId: last.recordId }
            : (from ?? null),
      };
    },

    async *keys(kind, batchSize) {
      const model = modelFor(kind);
      let cursor: string | null = null;
      for (;;) {
        const filter = cursor == null ? {} : { [KIND_ID[kind]]: { $gt: cursor } };
        const docs = await runAsSystem(() =>
          model
            .find(filter)
            .select(`${KIND_ID[kind]} user tenantId`)
            .sort({ [KIND_ID[kind]]: 1 })
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
          recordId: asString(doc[KIND_ID[kind]]),
        }));
        cursor = asString(docs[docs.length - 1][KIND_ID[kind]]);
      }
    },
  };
}
