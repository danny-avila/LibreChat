import _ from 'lodash';
import { parseTextParts } from 'librechat-data-provider';
import type { Document, FilterQuery, Schema } from 'mongoose';
import type { IMessage } from '~/types';
import { buildRetentionVisibilityFilter, legacyPermanentExpirationFilter } from '~/utils/retention';

/**
 * Shared preprocessing and guards for every search sink. These moved out of the
 * Meilisearch plugin so the projector, the Meili sink and the reconciler apply
 * one definition of "indexable", "unfinished" and "searchable text" instead of
 * three drifting copies.
 */

export type SearchableDocument = {
  isTemporary?: boolean;
  expiredAt?: Date | null;
  unfinished?: boolean;
  content?: unknown;
  conversationId?: unknown;
  $isDefault?: (path: string) => boolean;
  $locals?: Document['$locals'];
};

const EXPLICIT_TEMPORARY_FLAG_KEY = 'meiliExplicitTemporaryFlag';

export const hasSchemaPath = (schema: Schema, path: string): boolean =>
  Object.prototype.hasOwnProperty.call(schema.obj, path);

export const buildIndexableQuery = (schema: Schema): FilterQuery<unknown> => {
  if (!hasSchemaPath(schema, 'isTemporary')) {
    return hasSchemaPath(schema, 'expiredAt') ? legacyPermanentExpirationFilter() : {};
  }
  return buildRetentionVisibilityFilter();
};

export const hasActiveExpiration = (expiredAt?: Date | null): boolean =>
  _.isNil(expiredAt) || new Date(expiredAt).getTime() > Date.now();

/**
 * `isTemporary` defaults to `false` on the schema, so hydrated legacy documents
 * can appear non-temporary even when the field is absent from MongoDB.
 * `$isDefault` distinguishes that schema default from an explicitly stored flag,
 * and `$locals` carries the pre-save answer into post hooks after Mongoose has
 * already mutated document state.
 */
export const hasExplicitTemporaryFlag = (doc: SearchableDocument): boolean => {
  const captured = doc.$locals?.[EXPLICIT_TEMPORARY_FLAG_KEY];
  if (typeof captured === 'boolean') {
    return captured;
  }
  return doc.isTemporary != null && doc.$isDefault?.('isTemporary') === false;
};

export const captureExplicitTemporaryFlag = (doc: SearchableDocument): void => {
  if (!doc.$locals) {
    return;
  }
  doc.$locals[EXPLICIT_TEMPORARY_FLAG_KEY] =
    doc.isTemporary != null && doc.$isDefault?.('isTemporary') === false;
};

/**
 * Index only retained non-temporary records whose flag was explicitly stored,
 * plus legacy permanent records that have no retention deadline. Legacy records
 * with an expiration are treated as temporary and stay out of search.
 */
export const isIndexableDocument = (doc: SearchableDocument): boolean =>
  (doc.isTemporary === false &&
    hasExplicitTemporaryFlag(doc) &&
    hasActiveExpiration(doc.expiredAt)) ||
  (!hasExplicitTemporaryFlag(doc) && _.isNil(doc.expiredAt));

/**
 * The same rule as `isIndexableDocument`, for a plain object rather than a
 * hydrated Mongoose document.
 *
 * The projector reads with `.lean()`, so `$isDefault` and `$locals` — how the
 * hydrated path tells a stored `false` from the schema default — do not exist.
 * On a lean document the distinction is simply whether the key is present, which
 * is the more direct expression of the same question.
 *
 * Returned as the effective temporary flag rather than a boolean "indexable"
 * because that is what a projection stores: a legacy record with a retention
 * deadline and no stored flag is temporary, so the read path excludes it exactly
 * as primary-store hydration does. Treating the absent flag as explicit
 * permanence instead would let such a record occupy a bounded candidate set and
 * hide real matches ranked below it, since hydration then drops it.
 */
export const effectiveTemporaryFlag = (doc: {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
}): boolean => {
  const stored = doc.isTemporary;
  if (stored != null) {
    return stored === true;
  }
  return !_.isNil(doc.expiredAt);
};

/**
 * Partial assistant rows are written mid-run by resume/HITL/abort paths and
 * overwritten at finalize. Projecting them makes partial generations searchable
 * and re-embeds the same turn at least twice, so every sink skips them.
 */
export const isUnfinished = (doc: SearchableDocument | null | undefined): boolean =>
  doc?.unfinished === true;

/**
 * Flattens a message `content` array into the single searchable string the
 * projector and every sink store. Steered words are included: search indexes the
 * full conversational record.
 */
export const flattenContent = (content: unknown): string | undefined => {
  if (!Array.isArray(content)) {
    return undefined;
  }
  return parseTextParts(content, false, { includeSteer: true });
};

/**
 * Normalizes searchable input identically on the write and read sides: Unicode
 * NFKC, whitespace collapse, trim. A query normalized differently from the
 * projected body silently loses exact matches.
 */
export const normalizeSearchText = (value: string): string =>
  value.normalize('NFKC').replace(/\s+/g, ' ').trim();

/**
 * Meilisearch rejects `|` in primary keys, so conversation ids are rewritten
 * for that sink only. PostgreSQL stores the id verbatim.
 */
export const escapeConversationId = (conversationId: string): string =>
  conversationId.replace(/\|/g, '--');

/**
 * A serialized document reduced to its indexable attributes. The attribute list
 * is per-model configuration resolved at runtime, so unlisted keys stay open
 * while the fields this module rewrites keep their schema types.
 */
export type IndexablePayload = Partial<Pick<IMessage, 'conversationId' | 'text' | 'content'>> & {
  [attribute: string]: unknown;
};

export const preprocessObjectForIndex = (
  source: IndexablePayload,
  attributesToIndex: readonly string[],
): IndexablePayload => {
  const object: IndexablePayload = _.omitBy(_.pick(source, attributesToIndex), (_v, key) =>
    key.startsWith('$'),
  );

  if (typeof object.conversationId === 'string' && object.conversationId.includes('|')) {
    object.conversationId = escapeConversationId(object.conversationId);
  }

  const text = flattenContent(object.content);
  if (text !== undefined) {
    object.text = text;
    delete object.content;
  }

  return object;
};
