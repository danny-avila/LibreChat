import type * as t from '~/admin/types';
import {
  getEntryKey,
  getKeyedCollection,
  hasIssueMessage,
  findKeyedCollectionEntry,
} from '~/admin/utils';
import { labelForPath } from './meta';

/** The collection path an issue belongs to, when it is inside (or about) a collection entry. */
function issueCollection(issue: t.ConfigIssue): t.KeyedCollection | undefined {
  return getKeyedCollection(issue.path) ?? findKeyedCollectionEntry(issue.path)?.collection;
}

/**
 * Where an issue shows on the page: entry issues are mapped by the entry's
 * identity to its position in the pending (displayed) items, since issue
 * paths index into the array that was validated or sent, not the page's.
 */
export function issueDisplayPath(issue: t.ConfigIssue, collections: t.PendingCollection[]): string {
  const collection = issueCollection(issue);
  if (!collection || issue.entryIdentity === undefined) return issue.path;
  const pending = collections.find((c) => c.collection.path === collection.path);
  if (!pending) return issue.path;
  const { items, edit } = pending;
  const byKey = items.findIndex(
    (item) => getEntryKey(item, collection.key) === issue.entryIdentity,
  );
  const index =
    byKey >= 0 ? byKey : edit.origins.findIndex((o) => o?.identity === issue.entryIdentity);
  if (index < 0) return collection.path;
  const base = `${collection.path}.${index}`;
  return issue.entryPath ? `${base}.${issue.entryPath}` : base;
}

const BOUND_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

/** Issue parameters for display: numbers with digit grouping ("60,000"). */
function displayParams(
  params: t.ConfigIssue['params'],
): Record<string, string | number> | undefined {
  if (!params) return params;
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === 'number' ? BOUND_FORMAT.format(value) : value,
    ]),
  );
}

/** Localized message of an issue: `com_admin_config_issue_<code>` when there is one, else the server's text. */
function issuePredicate(issue: t.ConfigIssue, localize: t.LocalizeFn): string {
  if (!issue.code) return issue.message;
  const key = `com_admin_config_issue_${issue.code.toLowerCase()}`;
  const localized = localize(key, displayParams(issue.params));
  return localized === key ? issue.message : localized;
}

/** "Label must …" for predicates; a free-form message keeps its own wording when it already names the field. */
function labeledMessage(label: string, message: string, isPredicate: boolean): string {
  if (isPredicate) return `${label} ${message}`;
  if (message.toLowerCase().startsWith(label.toLowerCase())) return message;
  return `${label}: ${message}`;
}

/**
 * Readable text for an issue: `inline` for the field itself ("Provider must
 * be "anthropic"") and `summary` naming the entry for lists ("GPT › Provider
 * must be "anthropic""). Codes without a generic predicate (refinement
 * messages, entry-level problems) are shown as full sentences.
 */
export function formatIssue(
  issue: t.ConfigIssue,
  displayPath: string,
  localize: t.LocalizeFn,
): { inline: string; summary: string } {
  const predicate = issuePredicate(issue, localize);
  const entryLevel = issue.entryIdentity !== undefined && !issue.entryPath;
  if (entryLevel) return { inline: predicate, summary: predicate };
  const label = labelForPath(displayPath, localize);
  const inline = labeledMessage(label, predicate, hasIssueMessage(issue.code));
  const summary = issue.entryIdentity ? `${issue.entryIdentity} › ${inline}` : inline;
  return { inline, summary };
}

/** Per-path inline messages and a summary line per issue, for the errors map and the review. */
export function describeIssues(
  issues: t.ConfigIssue[],
  collections: t.PendingCollection[],
  localize: t.LocalizeFn,
): { fieldErrors: Record<string, string>; summaries: string[] } {
  const fieldErrors: Record<string, string> = {};
  const summaries: string[] = [];
  for (const issue of issues) {
    const path = issueDisplayPath(issue, collections);
    const { inline, summary } = formatIssue(issue, path, localize);
    fieldErrors[path] = fieldErrors[path] ? `${fieldErrors[path]}; ${inline}` : inline;
    if (!summaries.includes(summary)) summaries.push(summary);
  }
  return { fieldErrors, summaries };
}
