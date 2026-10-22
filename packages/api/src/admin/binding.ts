import isPlainObject from 'lodash/isPlainObject';
import { webSearchPairedFields, getRebindingWebSearchKeys } from '@librechat/data-schemas';
import type { Config, ConfigOverrideIssue } from '@librechat/data-schemas';

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
 * Re-entry issues for a write (a replace, a field patch, a batch of changes
 * or a field removal), judged on the document it would store: each stored
 * key the planned document keeps beside a paired URL the write set, changed,
 * blanked or removed.
 *
 * A key counts as entered again only when the planned document holds a value
 * the request itself entered (`getEnteredConfigSecrets`). Writes apply in
 * order, so a later write can put the stored key back over one an earlier
 * write supplied (a whole `webSearch` after one of its keys); judging by the
 * value the document ends up with, not by the paths the request wrote, keeps
 * that order from hiding a kept key.
 * @param stored - The document before the write.
 * @param next - The overrides and tombstones the write would store, omitted secrets preserved.
 * @param entered - The secret values the request itself entered, encrypted; none for a removal.
 */
export function getWebSearchReentryIssues(
  stored: StoredConfigState,
  next: StoredConfigState,
  entered: ReadonlySet<string>,
): SecretReentryIssue[] {
  const nextWebSearch = getWebSearch(next?.overrides);
  const written = new Set<string>();
  for (const [field, value] of Object.entries(nextWebSearch ?? {})) {
    if (typeof value === 'string' && entered.has(value)) {
      written.add(field);
    }
  }
  return toReentryIssues(
    getWebSearchView(getWebSearch(stored?.overrides), stored?.tombstones),
    getWebSearchView(nextWebSearch, next?.tombstones),
    written,
  );
}
