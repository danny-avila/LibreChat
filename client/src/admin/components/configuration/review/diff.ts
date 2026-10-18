import type * as t from '~/admin/types';
import {
  flattenObject,
  getValueAtPath,
  isConfigRecord,
  unflattenObject,
  stripSecretPreviewValues,
} from '~/admin/utils';
import { isConfigValueEqual, normalizeForSave } from '../edits';
import { SECRET_CONFIG_KEYS } from '~/admin/constants';
import { findSchemaField } from '../controls';
import { getFieldMeta } from '../meta';

/** Identity key of known keyed lists (D1/D2: entries are matched by it, never by index). */
const IDENTITY_KEYS: Readonly<Record<string, string>> = {
  'endpoints.custom': 'name',
  'modelSpecs.list': 'name',
  'endpoints.azureOpenAI.groups': 'group',
};

/** Keys tried, in order, to identify the entries of other lists of objects. */
const IDENTITY_CANDIDATES = ['name', 'group', 'id', 'key', 'label', 'title'];

/** Lists LibreChat merges with librechat.yaml by name; saving one never takes over the whole list. */
const MERGED_COLLECTIONS: ReadonlySet<string> = new Set(['endpoints.custom']);

/** List fields where an empty list means "allow nothing". */
const ALLOWLIST_KEYS: ReadonlySet<string> = new Set([
  'allowedDomains',
  'allowedAddresses',
  'addedEndpoints',
  'allowedProviders',
]);

const INDEX_SEGMENT_RE = /^\d+$/;

interface DiffContext {
  input: t.ChangeSummaryInput;
  sourcePath: string;
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

/** `endpoints.custom.3.name` → `endpoints.custom.name`, for lookups keyed by index-free paths. */
export function stripIndices(path: string): string {
  return path
    .split('.')
    .filter((segment) => !INDEX_SEGMENT_RE.test(segment))
    .join('.');
}

/**
 * Whether a value at `path` must never be shown: a secret key (`apiKey`,
 * `client_secret`, …), the `key` of an `apiKey` object, or a field the
 * metadata registry marks secret.
 */
export function isSecretPath(path: string): boolean {
  const segments = path.split('.');
  const last = segments[segments.length - 1];
  if (SECRET_CONFIG_KEYS.has(last)) return true;
  const parent = segments[segments.length - 2];
  if (parent != null && SECRET_CONFIG_KEYS.has(parent) && last === 'key') return true;
  return getFieldMeta(path)?.secret === true;
}

export function isObjectList(value: t.ConfigValue): value is t.ConfigRecord[] {
  return Array.isArray(value) && value.length > 0 && value.every(isConfigRecord);
}

function isRecordCollection(field: t.SchemaField | null): boolean {
  return field?.type === 'record' && field.recordValueType === 'complex';
}

function isEntryList(field: t.SchemaField | null): boolean {
  return field?.isArray === true && (field.children?.length ?? 0) > 0;
}

/** The key identifying the entries of a list, or undefined when entries only have positions. */
export function identityKeyFor(path: string, entries: t.ConfigValue[]): string | undefined {
  const known = IDENTITY_KEYS[stripIndices(path)];
  if (known) return known;
  const records = entries.filter(isConfigRecord);
  if (records.length === 0) return undefined;
  return IDENTITY_CANDIDATES.find((key) =>
    records.every((entry) => typeof entry[key] === 'string' && entry[key] !== ''),
  );
}

function identityOf(entry: t.ConfigValue, key: string | undefined): string | undefined {
  if (!key || !isConfigRecord(entry)) return undefined;
  const value = entry[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The outermost collection entry `path` is in (or is): a record entry such as
 * `mcpServers.github`, or a list entry such as `endpoints.custom.3`, whose
 * identity is read from the entry value `entryAt` returns.
 */
export function findEntry(
  fields: t.SchemaField[],
  path: string,
  entryAt: (entryPath: string) => t.ConfigValue,
): t.ChangeEntryRef | undefined {
  const segments = path.split('.');
  for (let i = 1; i < segments.length; i++) {
    const collectionPath = segments.slice(0, i).join('.');
    const field = findSchemaField(fields, collectionPath);
    const entryPath = `${collectionPath}.${segments[i]}`;
    if (isRecordCollection(field)) return { collectionPath, entryPath, identity: segments[i] };
    if (isEntryList(field) && INDEX_SEGMENT_RE.test(segments[i])) {
      const value = entryAt(entryPath);
      const identity = identityOf(value, identityKeyFor(collectionPath, [value]));
      return { collectionPath, entryPath, identity };
    }
  }
  return undefined;
}

function withEntry(
  item: t.ChangeSummaryItem,
  entry: t.ChangeEntryRef | undefined,
): t.ChangeSummaryItem {
  if (!entry) return item;
  return {
    ...item,
    collectionPath: entry.collectionPath,
    entryPath: entry.entryPath,
    entryIdentity: entry.identity,
  };
}

function allowlistWarning(path: string, after: t.ConfigValue): t.ChangeWarning[] {
  return Array.isArray(after) && after.length === 0 && ALLOWLIST_KEYS.has(lastSegment(path))
    ? ['emptyAllowlist']
    : [];
}

/**
 * Saving a list the target does not own yet makes the whole list the
 * target's: librechat.yaml (or, for a profile, Base) no longer feeds it.
 * Lists of entries always warn; plain lists only in a profile, where the
 * saved list replaces the inherited one users currently get.
 */
function ownershipWarning(path: string, after: t.ConfigValue, ctx: DiffContext): t.ChangeWarning[] {
  if (!Array.isArray(after) || MERGED_COLLECTIONS.has(stripIndices(path))) return [];
  if (ctx.input.isOwned(path)) return [];
  const lower = ctx.input.lowerAt(path)?.value;
  if (!Array.isArray(lower) || lower.length === 0) return [];
  return isObjectList(after) || isObjectList(lower) || ctx.input.isScope ? ['ownershipChange'] : [];
}

function warningsOf(...lists: t.ChangeWarning[][]): t.ChangeWarning[] | undefined {
  const merged = [...new Set(lists.flat())];
  return merged.length > 0 ? merged : undefined;
}

function leafKind(before: t.ConfigValue, after: t.ConfigValue): t.ChangeKind {
  if (before == null) return 'added';
  return after == null ? 'removed' : 'changed';
}

/**
 * A change of one value. Outside collections, BEFORE is the target's own
 * value; when the target has none, `revertTarget` carries the value in effect
 * from the layer below (librechat.yaml or the default for Base, Base for a
 * profile) so the review can say what is currently inherited.
 */
function leafItem(
  path: string,
  before: t.ConfigValue,
  after: t.ConfigValue,
  ctx: DiffContext,
  entry: t.ChangeEntryRef | undefined,
): t.ChangeSummaryItem {
  const item: t.ChangeSummaryItem = {
    path,
    kind: leafKind(before, after),
    before,
    after,
    sourcePath: ctx.sourcePath,
    secret: isSecretPath(path) || undefined,
    warnings: warningsOf(allowlistWarning(path, after), ownershipWarning(path, after, ctx)),
  };
  if (entry) return withEntry(withInherited(item, entry, ctx), entry);
  if (ctx.input.isOwned(path)) return item;
  const lower = ctx.input.lowerAt(path);
  if (before == null) return lower ? { ...item, revertTarget: lower } : item;
  return {
    ...item,
    kind: 'changed',
    before: undefined,
    revertTarget: { value: before, source: lower?.source ?? 'yaml' },
  };
}

/**
 * A field the target sets for the first time on an entry addressed by key
 * (an inherited MCP server overridden in a profile) says what it inherits.
 * Entries of lists are addressed by position, which differs between layers,
 * so their lower-layer value is not looked up.
 */
function withInherited(
  item: t.ChangeSummaryItem,
  entry: t.ChangeEntryRef,
  ctx: DiffContext,
): t.ChangeSummaryItem {
  if (item.before != null || entry.identity !== lastSegment(entry.entryPath)) return item;
  const lower = ctx.input.lowerAt(item.path);
  return lower ? { ...item, revertTarget: lower } : item;
}

function entryItem(
  kind: t.ChangeKind,
  entry: t.ChangeEntryRef,
  before: t.ConfigValue,
  after: t.ConfigValue,
  ctx: DiffContext,
): t.ChangeSummaryItem {
  const yaml = ctx.input.yamlEntries(entry.collectionPath);
  const touchesYaml = kind === 'removed' && entry.identity != null && yaml?.has(entry.identity);
  return withEntry(
    {
      path: entry.entryPath,
      kind,
      before,
      after,
      sourcePath: ctx.sourcePath,
      warnings: touchesYaml ? ['yamlEntry'] : undefined,
    },
    entry,
  );
}

function omitKey(value: t.ConfigValue, key: string): t.ConfigValue {
  if (!isConfigRecord(value)) return value;
  const { [key]: _omitted, ...rest } = value;
  return rest;
}

/** A renamed entry: one rename row, then its other field changes (matched to the old entry). */
function renameItems(
  entryRef: t.ChangeEntryRef,
  previous: string,
  before: t.ConfigValue,
  after: t.ConfigValue,
  key: string,
  ctx: DiffContext,
): t.ChangeSummaryItem[] {
  const yaml = ctx.input.yamlEntries(entryRef.collectionPath);
  const renamed: t.ChangeSummaryItem = {
    ...entryItem('renamed', entryRef, previous, entryRef.identity, ctx),
    previousIdentity: previous,
    warnings: yaml?.has(previous) ? ['yamlEntry'] : undefined,
  };
  const fieldChanges = diffValue(
    entryRef.entryPath,
    omitKey(before, key),
    omitKey(after, key),
    ctx,
    entryRef,
  );
  return [renamed, ...fieldChanges.map((item) => ({ ...item, previousIdentity: previous }))];
}

/**
 * The BEFORE entry each AFTER entry is the same entry as, by identity, each
 * BEFORE entry used once: an entry still at its position first, then the
 * first unused entry with its name. A second entry with a name already taken
 * (one renamed onto an existing name) is left unmatched, so it reads as the
 * rename or addition it is, not as an edit of the other entry.
 */
function matchEntries(
  before: t.ConfigValue[],
  after: t.ConfigValue[],
  key: string,
  beforeIndex: Map<string, number>,
): Array<number | undefined> {
  const used = new Set<number>();
  const ids = after.map((entry) => identityOf(entry, key));
  const matched = ids.map((id, j) => {
    if (id == null || identityOf(before[j], key) !== id) return undefined;
    used.add(j);
    return j;
  });
  return matched.map((found, j) => {
    const id = ids[j];
    if (found !== undefined || id == null) return found;
    const first = beforeIndex.get(id);
    const index =
      first !== undefined && !used.has(first)
        ? first
        : before.findIndex((entry, i) => !used.has(i) && identityOf(entry, key) === id);
    if (index === undefined || index < 0) return undefined;
    used.add(index);
    return index;
  });
}

/** Entries of a list matched by identity: added, removed, renamed (same position, new name) and changed. */
function diffEntryList(
  path: string,
  before: t.ConfigValue[],
  after: t.ConfigValue[],
  ctx: DiffContext,
): t.ChangeSummaryItem[] {
  const key = identityKeyFor(path, [...before, ...after]);
  if (!key) return diffPositionalList(path, before, after, ctx);
  const beforeIndex = new Map<string, number>();
  before.forEach((entry, i) => {
    const id = identityOf(entry, key);
    if (id != null && !beforeIndex.has(id)) beforeIndex.set(id, i);
  });
  const afterIds = new Set(after.map((entry) => identityOf(entry, key)));
  const renamedFrom = new Set<string>();
  const items: t.ChangeSummaryItem[] = [];
  const matched = matchEntries(before, after, key, beforeIndex);

  after.forEach((entry, j) => {
    const id = identityOf(entry, key);
    const entryRef: t.ChangeEntryRef = {
      collectionPath: path,
      entryPath: `${path}.${j}`,
      identity: id,
    };
    const from = matched[j];
    if (from !== undefined) {
      items.push(...diffValue(entryRef.entryPath, before[from], entry, ctx, entryRef));
      return;
    }
    const previous = identityOf(before[j], key);
    if (previous != null && !afterIds.has(previous)) {
      renamedFrom.add(previous);
      items.push(...renameItems(entryRef, previous, before[j], entry, key, ctx));
      return;
    }
    items.push(entryItem('added', entryRef, undefined, entry, ctx));
  });

  before.forEach((entry, i) => {
    const id = identityOf(entry, key);
    if (id == null || afterIds.has(id) || renamedFrom.has(id)) return;
    const entryRef: t.ChangeEntryRef = {
      collectionPath: path,
      entryPath: `${path}.${i}`,
      identity: id,
    };
    items.push(entryItem('removed', entryRef, entry, undefined, ctx));
  });

  const order = (list: t.ConfigValue[]) =>
    list.map((entry) => identityOf(entry, key)).filter((id) => id != null && beforeIndex.has(id));
  const beforeOrder = order(before).filter((id) => afterIds.has(id));
  const afterOrder = order(after);
  /** A name two entries share (one renamed onto another) is an error the review shows, not a reorder. */
  const hasDuplicate = new Set(afterOrder).size !== afterOrder.length;
  if (!hasDuplicate && beforeOrder.length > 1 && beforeOrder.join('\n') !== afterOrder.join('\n')) {
    items.push({
      path,
      kind: 'changed',
      before: beforeOrder as string[],
      after: afterOrder as string[],
      sourcePath: ctx.sourcePath,
      collectionPath: path,
    });
  }
  return items;
}

/** Entries without an identity key are compared position by position. */
function diffPositionalList(
  path: string,
  before: t.ConfigValue[],
  after: t.ConfigValue[],
  ctx: DiffContext,
): t.ChangeSummaryItem[] {
  const items: t.ChangeSummaryItem[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const entryRef: t.ChangeEntryRef = { collectionPath: path, entryPath: `${path}.${i}` };
    if (i >= before.length) items.push(entryItem('added', entryRef, undefined, after[i], ctx));
    else if (i >= after.length)
      items.push(entryItem('removed', entryRef, before[i], undefined, ctx));
    else items.push(...diffValue(entryRef.entryPath, before[i], after[i], ctx, entryRef));
  }
  return items;
}

/** Entries of a record collection (`mcpServers`) saved as a whole, matched by key. */
function diffRecordCollection(
  path: string,
  before: t.ConfigRecord,
  after: t.ConfigRecord,
  ctx: DiffContext,
): t.ChangeSummaryItem[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((key) => {
    const entryRef: t.ChangeEntryRef = {
      collectionPath: path,
      entryPath: `${path}.${key}`,
      identity: key,
    };
    if (before[key] == null) return [entryItem('added', entryRef, undefined, after[key], ctx)];
    if (after[key] == null) return [entryItem('removed', entryRef, before[key], undefined, ctx)];
    return diffValue(entryRef.entryPath, before[key], after[key], ctx, entryRef);
  });
}

/** Changed leaves between two values: lists of entries by identity, objects key by key. */
function diffValue(
  path: string,
  before: t.ConfigValue,
  after: t.ConfigValue,
  ctx: DiffContext,
  entry: t.ChangeEntryRef | undefined,
): t.ChangeSummaryItem[] {
  if (isConfigValueEqual(before, after)) return [];
  const field = findSchemaField(ctx.input.fields, path);
  if (isObjectList(before) || isObjectList(after)) {
    const beforeList = Array.isArray(before) ? before : [];
    const afterList = Array.isArray(after) ? after : [];
    const items = diffEntryList(path, beforeList, afterList, ctx);
    const warnings = ownershipWarning(path, after, ctx);
    if (warnings.length === 0 || items.length === 0) return items;
    return items.map((item) => ({ ...item, warnings: warningsOf(item.warnings ?? [], warnings) }));
  }
  const isEntryPath = entry?.entryPath === path;
  if (isEntryPath && entry && isConfigRecord(before) && isConfigRecord(after)) {
    const key = identityKeyFor(entry.collectionPath, [before, after]);
    const previous = identityOf(before, key);
    const next = identityOf(after, key);
    const isList = isEntryList(findSchemaField(ctx.input.fields, entry.collectionPath));
    if (key && isList && previous != null && next != null && previous !== next) {
      return renameItems({ ...entry, identity: next }, previous, before, after, key, ctx);
    }
  }
  if (
    isRecordCollection(field) &&
    isConfigRecord(after) &&
    (before == null || isConfigRecord(before))
  ) {
    return diffRecordCollection(path, before ?? {}, after, ctx);
  }
  if (isConfigRecord(after) && isConfigRecord(before)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => diffValue(`${path}.${key}`, before[key], after[key], ctx, entry));
  }
  if (isConfigRecord(after) && before == null) {
    if (isEntryPath && entry) return [entryItem('added', entry, undefined, after, ctx)];
    const leaves = Object.entries(flattenObject(after, path));
    return leaves.map(([leafPath, value]) => leafItem(leafPath, undefined, value, ctx, entry));
  }
  if (after == null && isEntryPath && entry) {
    return [entryItem('removed', entry, before, undefined, ctx)];
  }
  return [leafItem(path, before, after, ctx, entry)];
}

/** The baseline value at `path`, shaped like a save value so unchanged parts compare equal. */
function baselineAt(input: t.ChangeSummaryInput, path: string): t.ConfigValue {
  const raw = getValueAtPath(input.baseline, path);
  if (raw === undefined) return undefined;
  const stripped = stripSecretPreviewValues(raw, path, input.schemaPaths);
  return normalizeForSave(stripped, findSchemaField(input.fields, path));
}

function resetItem(path: string, input: t.ChangeSummaryInput): t.ChangeSummaryItem {
  const lower = input.lowerAt(path);
  const entry = findEntry(
    input.fields,
    path,
    (entryPath) => getValueAtPath(input.baseline, entryPath) ?? input.ownAt(entryPath),
  );
  const item: t.ChangeSummaryItem = {
    path,
    kind: 'reverted',
    before: input.ownAt(path),
    after: undefined,
    revertTarget: lower,
    sourcePath: path,
    secret: isSecretPath(path) || undefined,
  };
  if (!entry) return item;
  if (entry.entryPath === path && lower?.value == null) {
    return withEntry({ ...item, kind: 'removed', revertTarget: undefined }, entry);
  }
  return withEntry(item, entry);
}

/**
 * Leaf edits of a record entry that does not exist yet in any layer (an MCP
 * server created field by field) read as one added entry.
 */
function newRecordEntry(path: string, input: t.ChangeSummaryInput): t.ChangeEntryRef | undefined {
  const entry = findEntry(input.fields, path, () => undefined);
  if (!entry || entry.entryPath === path) return undefined;
  if (!isRecordCollection(findSchemaField(input.fields, entry.collectionPath))) return undefined;
  if (getValueAtPath(input.baseline, entry.entryPath) != null) return undefined;
  if (input.lowerAt(entry.entryPath)?.value != null) return undefined;
  return entry;
}

/**
 * Human-readable changes for what Save sends (WS7; the `ChangeSummaryItem`
 * contract WS1 produces). Every save is compared with the value the edit was
 * made against: lists of entries are matched by identity (name, group, …)
 * and report added, removed, renamed and changed entries; objects report only
 * the leaves that changed. Resets report the value the field reverts to.
 */
export function summarizeChanges(input: t.ChangeSummaryInput): t.ChangeSummaryItem[] {
  const items: t.ChangeSummaryItem[] = [];
  const newEntries = new Map<string, { entry: t.ChangeEntryRef; leaves: t.FlatConfigMap }>();
  for (const { fieldPath, value } of input.saves) {
    const created = newRecordEntry(fieldPath, input);
    if (created) {
      const group = newEntries.get(created.entryPath) ?? { entry: created, leaves: {} };
      group.leaves[fieldPath.slice(created.entryPath.length + 1)] = value;
      newEntries.set(created.entryPath, group);
      continue;
    }
    const before = baselineAt(input, fieldPath);
    const entry = findEntry(input.fields, fieldPath, (entryPath) =>
      entryPath === fieldPath ? (value ?? before) : getValueAtPath(input.baseline, entryPath),
    );
    const ctx: DiffContext = { input, sourcePath: fieldPath };
    items.push(...diffValue(fieldPath, before, value, ctx, entry));
  }
  for (const { entry, leaves } of newEntries.values()) {
    const ctx: DiffContext = { input, sourcePath: entry.entryPath };
    items.push(entryItem('added', entry, undefined, unflattenObject(leaves), ctx));
  }
  for (const path of input.resets) items.push(resetItem(path, input));
  return pairRecordRenames(items);
}

/** An entry change of a whole entry (added or removed), not one of its fields. */
function isWholeEntry(item: t.ChangeSummaryItem, kind: t.ChangeKind): boolean {
  return item.kind === kind && item.entryPath === item.path && item.collectionPath != null;
}

/**
 * A record entry removed and one added with the same value (an MCP server
 * renamed: the old key's leaves are removed, the new key's written) read as
 * one rename.
 */
function pairRecordRenames(items: t.ChangeSummaryItem[]): t.ChangeSummaryItem[] {
  const removed = items.filter((item) => isWholeEntry(item, 'removed'));
  if (removed.length === 0) return items;
  const paired = new Set<t.ChangeSummaryItem>();
  const result = items.map((item): t.ChangeSummaryItem => {
    if (!isWholeEntry(item, 'added') || !isConfigRecord(item.after)) return item;
    const match = removed.find(
      (candidate) =>
        !paired.has(candidate) &&
        candidate.collectionPath === item.collectionPath &&
        isConfigValueEqual(candidate.before, item.after),
    );
    if (!match) return item;
    paired.add(match);
    return {
      ...item,
      kind: 'renamed',
      before: match.before,
      previousIdentity: match.entryIdentity,
    };
  });
  return result.filter((item) => !paired.has(item));
}

function setPath(tree: t.ConfigValue, segments: string[], value: t.ConfigValue): t.ConfigValue {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  if (Array.isArray(tree) && INDEX_SEGMENT_RE.test(head)) {
    const copy = [...tree];
    copy[Number(head)] = setPath(tree[Number(head)], rest, value);
    return copy;
  }
  const record = isConfigRecord(tree) ? tree : {};
  return { ...record, [head]: setPath(record[head], rest, value) };
}

/** The baseline with pending saves applied: what entry titles and issue labels are read from. */
export function applySaves(baseline: t.ConfigRecord | null, saves: t.SaveEntry[]): t.ConfigRecord {
  const tree = saves.reduce<t.ConfigValue>(
    (current, { fieldPath, value }) => setPath(current, fieldPath.split('.'), value),
    baseline ?? {},
  );
  return isConfigRecord(tree) ? tree : {};
}

/**
 * The value a path falls back to without the target's own override: for a
 * profile, Base; for Base, librechat.yaml ("default" when it only repeats the
 * schema default), else the schema default.
 */
export function lowerValue(path: string, layers: t.LowerLayers): t.RevertTarget | undefined {
  const fallback = layers.schemaDefaults[path];
  const lower = getValueAtPath(layers.isScope ? layers.configValues : layers.yamlConfig, path);
  if (lower !== undefined) {
    if (layers.isScope) return { value: lower, source: 'inherited' };
    return { value: lower, source: isConfigValueEqual(lower, fallback) ? 'default' : 'yaml' };
  }
  return fallback === undefined ? undefined : { value: fallback, source: 'default' };
}
