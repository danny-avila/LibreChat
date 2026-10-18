import type * as t from '~/admin/types';
import { getValueAtPath, isConfigRecord, deepSerializeKVPairs } from '~/admin/utils';
import { isConfigValueEqual, normalizeForSave } from '../edits';
import { identityKeyFor } from './diff';

const INDEX_SEGMENT_RE = /^\d+$/;

function childOf(value: t.ConfigValue, segment: string): t.ConfigValue {
  if (Array.isArray(value))
    return INDEX_SEGMENT_RE.test(segment) ? value[Number(segment)] : undefined;
  return isConfigRecord(value) ? value[segment] : undefined;
}

function relativeSegments(path: string, base: string): string[] {
  return path === base ? [] : path.slice(base.length + 1).split('.');
}

/**
 * `pending` with the value at `segments` put back to the one in `baseline`
 * (removed when the baseline has none). Where the pending value is shaped
 * differently from the baseline (a key/value pair list standing for a
 * record), that container is restored as a whole.
 */
export function revertAt(
  pending: t.ConfigValue,
  baseline: t.ConfigValue,
  segments: string[],
): t.ConfigValue {
  if (segments.length === 0) return baseline;
  const [head, ...rest] = segments;
  if (Array.isArray(pending) && INDEX_SEGMENT_RE.test(head)) {
    const next = [...pending];
    next[Number(head)] = revertAt(pending[Number(head)], childOf(baseline, head), rest);
    return next;
  }
  if (isConfigRecord(pending)) {
    const child = revertAt(pending[head], childOf(baseline, head), rest);
    const { [head]: _previous, ...others } = pending;
    return child === undefined ? others : { ...others, [head]: child };
  }
  return baseline;
}

function findByIdentity(
  list: t.ConfigValue[],
  key: string | undefined,
  identity: string | undefined,
): { index: number; value: t.ConfigValue } | undefined {
  if (!key || identity == null) return undefined;
  const index = list.findIndex((entry) => isConfigRecord(entry) && entry[key] === identity);
  return index === -1 ? undefined : { index, value: list[index] };
}

function indexOfEntry(entryPath: string): number {
  return Number(entryPath.slice(entryPath.lastIndexOf('.') + 1));
}

/** A list with one entry change undone: an added entry dropped, a removed one restored, a rename or field put back. */
function revertListEntry(
  pending: t.ConfigValue[],
  baseline: t.ConfigValue[],
  item: t.ChangeSummaryItem,
): t.ConfigValue[] {
  const key = identityKeyFor(item.collectionPath ?? '', [...pending, ...baseline]);
  const entryPath = item.entryPath ?? item.path;
  const position = indexOfEntry(entryPath);

  if (item.path === item.collectionPath) {
    if (!key) return baseline;
    const rank = new Map(baseline.map((entry, i) => [isConfigRecord(entry) ? entry[key] : i, i]));
    const ranked = (entry: t.ConfigValue) =>
      rank.get(isConfigRecord(entry) ? entry[key] : undefined) ?? Number.MAX_SAFE_INTEGER;
    return [...pending].sort((a, b) => ranked(a) - ranked(b));
  }

  if (item.kind === 'added' && item.path === entryPath) {
    const match = findByIdentity(pending, key, item.entryIdentity);
    const index = match?.index ?? position;
    return pending.filter((_, i) => i !== index);
  }

  if (item.kind === 'removed' && item.path === entryPath) {
    const restored = findByIdentity(baseline, key, item.entryIdentity)?.value ?? item.before;
    const next = [...pending];
    next.splice(Math.min(position, next.length), 0, restored);
    return next;
  }

  const current = findByIdentity(pending, key, item.entryIdentity);
  const index = current?.index ?? position;
  const previous =
    findByIdentity(baseline, key, item.previousIdentity ?? item.entryIdentity)?.value ??
    baseline[position];
  const next = [...pending];
  if (item.kind === 'renamed' && item.path === entryPath && key) {
    next[index] = revertAt(pending[index], previous, [key]);
    return next;
  }
  next[index] = revertAt(pending[index], previous, relativeSegments(item.path, entryPath));
  return next;
}

/**
 * The pending value of `sourcePath` with one change of it undone. Lists of
 * entries are matched by identity; everything else, record collections
 * included (their keys are the identities), is reverted by path.
 */
function revertWithin(
  pending: t.ConfigValue,
  baseline: t.ConfigValue,
  sourcePath: string,
  item: t.ChangeSummaryItem,
): t.ConfigValue {
  const { collectionPath } = item;
  const byPath = () => revertAt(pending, baseline, relativeSegments(item.path, sourcePath));
  if (
    collectionPath == null ||
    (collectionPath !== sourcePath && !collectionPath.startsWith(`${sourcePath}.`))
  ) {
    return byPath();
  }
  const toCollection = relativeSegments(collectionPath, sourcePath);
  const at = (value: t.ConfigValue) =>
    toCollection.length > 0 ? getValueAtPath(value, toCollection.join('.')) : value;
  const pendingList = at(pending);
  if (!Array.isArray(pendingList)) return byPath();
  const baselineList = at(baseline);
  const reverted = revertListEntry(
    pendingList,
    Array.isArray(baselineList) ? baselineList : [],
    item,
  );
  return setAt(pending, toCollection, reverted);
}

function setAt(value: t.ConfigValue, segments: string[], next: t.ConfigValue): t.ConfigValue {
  if (segments.length === 0) return next;
  const [head, ...rest] = segments;
  if (Array.isArray(value) && INDEX_SEGMENT_RE.test(head)) {
    const copy = [...value];
    copy[Number(head)] = setAt(value[Number(head)], rest, next);
    return copy;
  }
  const record = isConfigRecord(value) ? value : {};
  return { ...record, [head]: setAt(record[head], rest, next) };
}

/** An entry edited as a whole, with only its rename put back. */
function revertRename(
  pending: t.ConfigValue,
  baseline: t.ConfigValue,
  item: t.ChangeSummaryItem,
): t.ConfigValue {
  const key = identityKeyFor(item.collectionPath ?? '', [pending, baseline]);
  return key ? revertAt(pending, baseline, [key]) : baseline;
}

function pendingUnder(editedValues: t.FlatConfigMap, path: string): string[] {
  return Object.keys(editedValues).filter((key) => key === path || key.startsWith(`${path}.`));
}

/**
 * The pending edit a row comes from. A keyed collection is reviewed as its
 * whole pending list, but its entries are edited at their own positions
 * (`endpoints.custom.3`): the row belongs to the deepest such edit that holds it.
 */
function pendingSourceOf(item: t.ChangeSummaryItem, editedValues: t.FlatConfigMap): string {
  const source = item.sourcePath ?? item.path;
  if (source in editedValues) return source;
  let deepest: string | undefined;
  for (const key of Object.keys(editedValues)) {
    if (!key.startsWith(`${source}.`)) continue;
    if (item.path !== key && !item.path.startsWith(`${key}.`)) continue;
    if (deepest === undefined || key.length > deepest.length) deepest = key;
  }
  return deepest ?? source;
}

/**
 * How Revert undoes one review row (WS7). A row that is a whole pending edit
 * (a field, a reset, an entry edited as a whole, or an entry created field by
 * field) drops those edits. A row that is one part of a larger edit (one
 * entry of a list saved as a whole, one field of an entry) rewrites that edit
 * with just this part put back; when nothing else is left, the edit is dropped.
 */
export function planRevert(
  item: t.ChangeSummaryItem,
  editedValues: t.FlatConfigMap,
  baselineTree: t.ConfigValue,
): t.ReviewRevertAction {
  const source = pendingSourceOf(item, editedValues);
  const isPending = source in editedValues;
  const isPart = isPending && item.path.startsWith(`${source}.`);
  const isOrder = isPending && item.path === source && item.collectionPath === source;
  const isRename = isPending && item.path === source && item.kind === 'renamed';
  /** A renamed record entry (an MCP server) is its new key's writes plus the old key's removals. */
  if (!isPending && item.kind === 'renamed' && item.previousIdentity && item.collectionPath) {
    const previousPath = `${item.collectionPath}.${item.previousIdentity}`;
    return {
      op: 'discard',
      paths: [...pendingUnder(editedValues, source), ...pendingUnder(editedValues, previousPath)],
    };
  }
  if (!isPart && !isOrder && !isRename) {
    const paths = pendingUnder(editedValues, source);
    return {
      op: 'discard',
      paths: paths.length > 0 ? paths : pendingUnder(editedValues, item.path),
    };
  }
  const baseline = getValueAtPath(baselineTree, source);
  const pending = deepSerializeKVPairs(editedValues[source]);
  const value = isRename
    ? revertRename(pending, baseline, item)
    : revertWithin(pending, baseline, source, item);
  if (isConfigValueEqual(normalizeForSave(value, null), normalizeForSave(baseline, null))) {
    return { op: 'discard', paths: [source] };
  }
  return { op: 'set', path: source, value };
}
