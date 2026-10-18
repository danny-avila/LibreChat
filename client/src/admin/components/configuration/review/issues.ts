import type * as t from '~/admin/types';
import { describePath } from './group';

/** A dot-path (with optional `[n]` indices or an `→ "key"` suffix) followed by `: `. */
const PATH_TOKEN = String.raw`[A-Za-z_$][\w$-]*(?:\.[\w$-]+|\[\d+\])+(?: → "[^"]*")?`;
const PART_RE = new RegExp(String.raw`^(${PATH_TOKEN}): ([\s\S]+)$`);
const SPLIT_RE = new RegExp(String.raw`;\s+(?=${PATH_TOKEN}: )`);
const SUMMARY_SEPARATOR = ' — ';
const BREADCRUMB = '›';

/** `groups[0].models` → `groups.0.models`; the `→ "key"` suffix of an unsafe key is dropped. */
function toDataPath(token: string): string {
  return token.replace(/ → "[^"]*"$/, '').replace(/\[(\d+)\]/g, '.$1');
}

/**
 * Splits a save or validation error ("Validation failed — a.b: msg; c[0].d:
 * msg") into one message per path. Text that names no path is kept whole.
 */
export function parseIssueMessages(message: string): Array<{ path?: string; message: string }> {
  const separator = message.indexOf(SUMMARY_SEPARATOR);
  const body = separator === -1 ? message : message.slice(separator + SUMMARY_SEPARATOR.length);
  const parts = body.split(SPLIT_RE).filter((part) => part.trim() !== '');
  const parsed = parts.map((part) => {
    const match = PART_RE.exec(part.trim());
    if (!match) return { message: part.trim() };
    const [, token, text] = match;
    const key = /→ "([^"]*)"$/.exec(token)?.[1];
    return { path: toDataPath(token), message: key ? `"${key}": ${text}` : text };
  });
  if (parsed.some((issue) => issue.path)) return parsed;
  return [{ message }];
}

/** The message without a leading "Field: " the label already ends with ("… › Name: Name: …"). */
function withoutLabelPrefix(message: string, label: string | undefined): string {
  const field = label?.slice(label.lastIndexOf(BREADCRUMB) + 1).trim();
  if (!field || !message.startsWith(`${field}: `)) return message;
  return message.slice(field.length + 2);
}

/** Issues from an error message, each labelled "Tab › Section › Entry › Field". */
export function toReviewIssues(
  message: string,
  blocking: boolean,
  ctx: t.ReviewLabelContext,
  fallbackPath?: string,
  identity?: string,
): t.ReviewIssue[] {
  return parseIssueMessages(message).map((issue) => {
    const path = issue.path ?? fallbackPath;
    const label = path ? describePath(path, ctx, issue.path ? undefined : identity) : undefined;
    return {
      path,
      label,
      message: withoutLabelPrefix(issue.message, label),
      blocking,
    };
  });
}
