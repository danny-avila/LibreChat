import { createHash } from 'crypto';
import { normalizeSearchText } from '@librechat/data-schemas';
import type { ProjectionSource } from './types';
import { FORMATTER_VERSION } from './constants';

/**
 * Re-exported rather than redefined: the projector and the query path must
 * normalize identically, and a query normalized differently from the projected
 * body silently loses exact matches. One definition, in `data-schemas`, shared
 * by every sink.
 */
export { normalizeSearchText } from '@librechat/data-schemas';

/**
 * Written as escapes rather than as the literal bytes. A source file carrying raw
 * control characters is classified as binary by git, which means no reviewable
 * diff of the thing that decides whether two records hash alike.
 */
const FIELD_SEPARATOR = '\u0000';
const TAG_SEPARATOR = '\u0001';

function digest(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    /** Length-prefixed so ('ab','c') and ('a','bc') cannot collide. */
    hash.update(String(part.length));
    hash.update(FIELD_SEPARATOR);
    hash.update(part);
  }
  return hash.digest('hex');
}

/**
 * Covers every projected column, so any change re-projects the row — and,
 * because the upsert treats an unchanged hash as a no-op, so that *nothing*
 * changing writes nothing at all.
 *
 * The source timestamps are here for that second reason rather than the first.
 * They are not searchable, but they are what the read path sorts by, so omitting
 * them would let a write that touched only `updatedAt` be swallowed as
 * "unchanged" and leave search ordering describing a state the record has left.
 */
export function contentHash(source: ProjectionSource): string {
  return digest([
    source.title,
    source.body,
    source.conversationId ?? '',
    source.tags.join(TAG_SEPARATOR),
    String(source.isArchived),
    source.projectId ?? '',
    String(source.isTemporary),
    source.expiresAt ? source.expiresAt.toISOString() : '',
    source.sourceCreatedAt ? source.sourceCreatedAt.toISOString() : '',
    source.sourceUpdatedAt ? source.sourceUpdatedAt.toISOString() : '',
  ]);
}

/**
 * Covers only what is actually embedded, plus the formatter version.
 *
 * Kept separate from the content hash on purpose: an archive toggle or a tag
 * edit changes the content hash and must re-project the row, but it does not
 * change the embedded text and must not trigger a re-embed. Conflating them is
 * how a re-embed storm starts.
 */
export function embeddingInputHash(source: ProjectionSource, space: string): string {
  return digest([
    space,
    FORMATTER_VERSION,
    normalizeSearchText(source.title),
    normalizeSearchText(source.body),
  ]);
}
