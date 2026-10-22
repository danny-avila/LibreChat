import isPlainObject from 'lodash/isPlainObject';
import { webSearchPairedFields, getRebindingWebSearchKeys } from '@librechat/data-schemas';
import type { Config, ConfigFieldWrite, ConfigOverrideIssue } from '@librechat/data-schemas';

/** Issue code for a URL a write changed while the secret stored beside it stays. */
export const SECRET_REENTRY_REQUIRED = 'secret_reentry_required';

/** A URL whose stored secret must be entered again in the same write. */
export interface SecretReentryIssue extends ConfigOverrideIssue {
  /** Dot-path of the stored secret to enter again. */
  secretPath: string;
}

/** The parts of a stored config document a re-entry check reads. */
export type StoredConfigState = Pick<Config, 'overrides' | 'tombstones'> | null | undefined;

type ConfigFields = Record<string, unknown>;

const WEB_SEARCH = 'webSearch';
const WEB_SEARCH_PREFIX = `${WEB_SEARCH}.`;
const PAIRED_FIELDS: ReadonlySet<string> = new Set(webSearchPairedFields);

function getRecord(value: unknown): ConfigFields | undefined {
  return isPlainObject(value) ? (value as ConfigFields) : undefined;
}

function getWebSearch(overrides: unknown): ConfigFields | undefined {
  return getRecord(getRecord(overrides)?.[WEB_SEARCH]);
}

/** The paired web search field a dot-path names directly, such as `searxngInstanceUrl`. */
function getPairedField(fieldPath: string): string | undefined {
  if (!fieldPath.startsWith(WEB_SEARCH_PREFIX)) {
    return undefined;
  }
  const field = fieldPath.slice(WEB_SEARCH_PREFIX.length);
  return PAIRED_FIELDS.has(field) ? field : undefined;
}

/**
 * A document's own web search values as the re-entry rule compares them. A
 * paired field the document tombstones and does not set reads as `null`,
 * since the tombstone suppresses the inherited value as a `null` would.
 */
function getWebSearchView(
  webSearch: ConfigFields | undefined,
  tombstones: readonly string[] = [],
): ConfigFields | undefined {
  const suppressed: readonly string[] = tombstones.includes(WEB_SEARCH)
    ? webSearchPairedFields
    : tombstones.flatMap((path) => getPairedField(path) ?? []);
  if (suppressed.length === 0) {
    return webSearch;
  }
  const view: ConfigFields = {};
  for (const field of suppressed) {
    view[field] = null;
  }
  return { ...view, ...webSearch };
}

function toReentryIssues(
  stored: ConfigFields | undefined,
  next: ConfigFields | undefined,
  written: ReadonlySet<string>,
): SecretReentryIssue[] {
  return getRebindingWebSearchKeys(stored, next, written).map(({ url, apiKey }) => ({
    path: `${WEB_SEARCH_PREFIX}${url}`,
    segments: [WEB_SEARCH, url],
    code: SECRET_REENTRY_REQUIRED,
    secretPath: `${WEB_SEARCH_PREFIX}${apiKey}`,
  }));
}

/**
 * Whether writing, removing or tombstoning this path can change where a
 * stored web search key is sent. Such a write must apply to the document
 * version its re-entry check read.
 */
export function isWebSearchBindingPath(fieldPath: string): boolean {
  return fieldPath === WEB_SEARCH || getPairedField(fieldPath) != null;
}

/**
 * Re-entry issues for a write that replaces a document's overrides. Its
 * tombstones stay as stored.
 * @param stored - The document before the write.
 * @param input - The overrides the request supplied.
 * @param next - The overrides the write would store, omitted secrets preserved.
 */
export function getReplaceReentryIssues(
  stored: StoredConfigState,
  input: unknown,
  next: unknown,
): SecretReentryIssue[] {
  const tombstones = stored?.tombstones;
  const written = new Set(Object.keys(getWebSearch(input) ?? {}));
  return toReentryIssues(
    getWebSearchView(getWebSearch(stored?.overrides), tombstones),
    getWebSearchView(getWebSearch(next), tombstones),
    written,
  );
}

/**
 * Re-entry issues for a field patch, judged on the document the patch would
 * store. Writes apply in request order, so a later write can replace what an
 * earlier one set (a whole `webSearch` after one of its fields); only the
 * planned document says which URL a stored key ends up beside.
 * @param stored - The document before the write.
 * @param writes - The field writes the request supplied, in order.
 * @param next - The overrides and tombstones the write would store, omitted secrets preserved.
 */
export function getPatchReentryIssues(
  stored: StoredConfigState,
  writes: readonly ConfigFieldWrite[],
  next: StoredConfigState,
): SecretReentryIssue[] {
  const written = new Set<string>();
  let touched = false;
  for (const { segments, value } of writes) {
    if (segments[0] !== WEB_SEARCH) {
      continue;
    }
    touched = true;
    if (segments.length === 1) {
      Object.keys(getRecord(value) ?? {}).forEach((field) => written.add(field));
    } else if (segments.length === 2) {
      written.add(segments[1]);
    }
  }
  if (!touched) {
    return [];
  }
  return toReentryIssues(
    getWebSearchView(getWebSearch(stored?.overrides), stored?.tombstones),
    getWebSearchView(getWebSearch(next?.overrides), next?.tombstones),
    written,
  );
}

/**
 * Re-entry issues for removing one field path from a document: a field delete
 * unsets the value and clears tombstones at and below the path, and a
 * tombstone unsets the value and suppresses the inherited one.
 * @param stored - The document before the write.
 * @param fieldPath - The dot-path the write removes.
 * @param tombstone - Whether the write tombstones the path rather than deleting it.
 */
export function getRemovalReentryIssues(
  stored: StoredConfigState,
  fieldPath: string,
  tombstone: boolean,
): SecretReentryIssue[] {
  const field = getPairedField(fieldPath);
  if (field == null) {
    return [];
  }
  const storedWebSearch = getWebSearch(stored?.overrides);
  const nextWebSearch = { ...storedWebSearch };
  delete nextWebSearch[field];
  const tombstones = stored?.tombstones ?? [];
  const nextTombstones = tombstone
    ? [...tombstones, fieldPath]
    : tombstones.filter((path) => path !== fieldPath && !path.startsWith(`${fieldPath}.`));
  return toReentryIssues(
    getWebSearchView(storedWebSearch, tombstones),
    getWebSearchView(nextWebSearch, nextTombstones),
    new Set(),
  );
}
