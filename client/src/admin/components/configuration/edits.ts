import type * as t from '~/admin/types';
import {
  getEntryKey,
  isConfigRecord,
  getValueAtPath,
  setValueAtPath,
  getWriteSkipReason,
  isConfigValueEqual,
  valueOrSecretPreview,
  getKeyedCollection,
  deepSerializeKVPairs,
  secretPathForPreviewPath,
  stripSecretPreviewValues,
  findKeyedCollectionEntry,
  isSecretKey,
} from '~/admin/utils';
import { elementField, findSchemaField } from './controls';
import { getFieldMeta } from './meta';

export { isConfigValueEqual } from '~/admin/utils';

const INDEXED_ARRAY_PATH_RE = /^(.+)\.(\d+)$/;

function normalizeArray(value: t.ConfigValue[], field: t.SchemaField | null): t.ConfigValue {
  if (value.every((item) => typeof item === 'string')) {
    const items = (value as string[]).filter((item) => item !== '');
    return items.length > 0 ? items : undefined;
  }
  const items: t.ConfigValue[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = normalizeForSave(value[i], field ? elementField(field, String(i)) : null);
    if (item !== undefined) items.push(item);
  }
  return items.length > 0 ? items : undefined;
}

/** Primitive values of a key/value record are stored as entered; nested ones are normalized. */
function normalizeRecordValue(
  child: t.ConfigValue,
  field: t.SchemaField,
  key: string,
): t.ConfigValue {
  if (isConfigRecord(child) || Array.isArray(child)) {
    return normalizeForSave(child, elementField(field, key));
  }
  return child;
}

function normalizeRecord(value: t.ConfigRecord, field: t.SchemaField | null): t.ConfigValue {
  const isRecord = field?.type === 'record';
  const result: t.ConfigRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized =
      field && isRecord
        ? normalizeRecordValue(child, field, key)
        : normalizeForSave(child, field ? childOf(field, key) : null);
    if (normalized !== undefined) result[key] = normalized;
  }
  if (isRecord && Object.keys(result).length === 0) return undefined;
  return result;
}

function childOf(field: t.SchemaField, key: string): t.SchemaField | null {
  return field.children?.find((f) => f.key === key) ?? null;
}

function keepsEmptyList(field: t.SchemaField | null): boolean {
  return field != null && getFieldMeta(field.path)?.emptyListIsValue === true;
}

/**
 * Reduces a pending value to what should actually be stored: empty strings and
 * empty list items are dropped (whitespace is preserved verbatim, since values
 * like stop sequences are whitespace-significant), and a list or record left with no items becomes
 * `undefined` ("no value") instead of an empty override that LibreChat would
 * read as "allow nothing" / "match everything" (except where the metadata
 * says an empty list is a value, such as no capabilities). Plain objects are kept even
 * when empty, since `{}` can be meaningful (e.g. a feature enabled with defaults).
 */
export function normalizeForSave(value: t.ConfigValue, field: t.SchemaField | null): t.ConfigValue {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return keepsEmptyList(field) ? [] : undefined;
    const serialized = deepSerializeKVPairs(value);
    if (!Array.isArray(serialized)) return normalizeRecord(serialized as t.ConfigRecord, field);
    return normalizeArray(value, field);
  }
  if (isConfigRecord(value)) return normalizeRecord(value, field);
  return value;
}

/** A value at `path` as Save would store it: key/value pairs serialized, masked previews dropped, blanks removed. */
export function normalizeEditValue(
  path: string,
  value: t.ConfigValue,
  fields: t.SchemaField[],
  schemaPaths: ReadonlySet<string>,
): t.ConfigValue {
  const serialized = stripSecretPreviewValues(deepSerializeKVPairs(value), path, schemaPaths);
  return normalizeForSave(serialized, findSchemaField(fields, path));
}

/** Whether the last segment of a path names a secret (`apiKey`, `tavilyApiKey`, `client_secret`). */
function isSecretPath(path: string): boolean {
  return isSecretKey(path.slice(path.lastIndexOf('.') + 1));
}

/**
 * Builds the save payload from touched edits. Only admin-touched paths are
 * submitted, secret display companion paths are dropped, and display
 * companion strings nested inside object values are stripped — a masked
 * display value (`sk-mist...4321`) must never reach the backend as a value.
 *
 * With a `context`, each value is normalized (`normalizeForSave`) and compared
 * with the normalized saved value: unchanged edits are dropped, and an edit
 * that empties a field becomes a reset when the target has its own override.
 * Emptying a value the target does not own (one only librechat.yaml sets) is
 * reported as `yamlValue`: there is no override to remove, and LibreChat has
 * no way to store "unset". Blanking a secret input never removes the stored
 * secret (that is an explicit reset). Paths the panel must not write
 * (read-only sections, permission fields) are reported in `skipped`.
 */
export function buildSavePayload(
  touchedPaths: ReadonlySet<string>,
  editedValues: t.FlatConfigMap,
  schemaPaths: ReadonlySet<string>,
  context?: t.SaveContext,
): t.SavePayload {
  const touched = [...touchedPaths].filter((p) => p in editedValues);
  const saves: t.SaveEntry[] = [];
  const resets: string[] = [];
  const skipped: t.SkippedChange[] = [];
  for (const path of touched) {
    const edited = editedValues[path];
    const reason = getWriteSkipReason(path, edited === undefined);
    if (reason) {
      skipped.push({ fieldPath: path, reason });
      continue;
    }
    if (edited === undefined) {
      resets.push(path);
      continue;
    }
    if (secretPathForPreviewPath(path, schemaPaths) != null) continue;
    const value = stripSecretPreviewValues(deepSerializeKVPairs(edited), path, schemaPaths);
    if (!context) {
      saves.push({ fieldPath: path, value });
      continue;
    }
    const field = findSchemaField(context.fields, path);
    const normalized = normalizeForSave(value, field);
    const baseline = normalizeForSave(
      stripSecretPreviewValues(deepSerializeKVPairs(context.baselineAt(path)), path, schemaPaths),
      field,
    );
    if (isConfigValueEqual(normalized, baseline)) continue;
    if (normalized !== undefined) {
      saves.push({ fieldPath: path, value: normalized });
    } else if (isSecretPath(path)) {
      continue;
    } else if (context.hasOverride(path)) {
      resets.push(path);
    } else {
      skipped.push({ fieldPath: path, reason: context.isScope ? 'inheritedValue' : 'yamlValue' });
    }
  }
  return { touched, saves, resets, skipped };
}

/** The keyed collection a pending edit path belongs to (the collection itself or one of its items). */
export function collectionOfPath(path: string): t.KeyedCollection | undefined {
  return getKeyedCollection(path) ?? findKeyedCollectionEntry(path)?.collection;
}

/** A collection as loaded, with each entry recorded as the origin of its own position. */
export function captureCollectionEdit(
  collection: t.KeyedCollection,
  root: t.ConfigValue,
): t.CollectionEdit {
  const loaded = getValueAtPath(root, collection.path);
  const baseline = Array.isArray(loaded) ? loaded : [];
  const origins = baseline.map((entry): t.EntryOrigin | null => {
    const identity = getEntryKey(entry, collection.key);
    return identity === undefined ? null : { identity, baseline: entry };
  });
  return { baseline, origins };
}

/**
 * A collection's items as the page shows them: the pending whole array (or
 * the baseline the edits were made against) with pending item and item-field
 * edits applied by index.
 */
export function pendingCollectionItems(
  collection: t.KeyedCollection,
  baseline: t.ConfigValue[],
  editedValues: t.FlatConfigMap,
): t.ConfigValue[] {
  const whole = editedValues[collection.path];
  const items = Array.isArray(whole) ? [...whole] : [...baseline];
  const prefix = `${collection.path}.`;
  for (const [path, value] of Object.entries(editedValues)) {
    if (!path.startsWith(prefix)) continue;
    const located = findKeyedCollectionEntry(path);
    if (!located || located.collection.path !== collection.path) continue;
    const { index, rest } = located;
    const current = items[index];
    items[index] =
      rest === '' ? value : setValueAtPath(isConfigRecord(current) ? current : {}, rest, value);
  }
  return items;
}

function matchPreviousItem(
  item: t.ConfigValue,
  previous: t.ConfigValue[],
  used: Set<number>,
  key: string,
): number {
  const byReference = previous.findIndex((candidate, i) => !used.has(i) && candidate === item);
  if (byReference >= 0) return byReference;
  const identity = getEntryKey(item, key);
  if (identity === undefined) return -1;
  return previous.findIndex(
    (candidate, i) => !used.has(i) && getEntryKey(candidate, key) === identity,
  );
}

/**
 * The origin of an item a whole-array edit put back (Undo of a deletion, a
 * reverted removal, an entry re-created under its old name): a loaded entry
 * taken out earlier, matched by its last pending value, else by key.
 */
function reattachOrigin(
  item: t.ConfigValue,
  detached: t.DetachedEntry[],
  claimed: Set<string>,
  key: string,
): t.EntryOrigin | null {
  const free = detached.filter(({ origin }) => !claimed.has(origin.identity));
  const identity = getEntryKey(item, key);
  const match =
    free.find((entry) => entry.value === item) ??
    (identity === undefined ? undefined : free.find((entry) => entry.origin.identity === identity));
  if (!match) return null;
  claimed.add(match.origin.identity);
  return match.origin;
}

/**
 * Updates a collection's item origins for an edit. A whole-array edit (add,
 * remove, reorder) maps each new item to the item it was in the previous
 * pending array, by reference first and then by key. Loaded entries the edit
 * drops are kept as detached, so an item that comes back (Undo, a reverted
 * removal) gets its loaded identity again; anything else is a new entry.
 * Item edits keep every origin, so a renamed entry still points at the entry
 * it was loaded as.
 */
export function trackCollectionEdit(
  collections: t.CollectionEdits,
  editedValues: t.FlatConfigMap,
  path: string,
  value: t.ConfigValue,
  root: t.ConfigValue,
): t.CollectionEdits {
  const collection = collectionOfPath(path);
  if (!collection) return collections;
  const current = collections[collection.path] ?? captureCollectionEdit(collection, root);
  if (path !== collection.path || !Array.isArray(value)) {
    return collections[collection.path]
      ? collections
      : { ...collections, [collection.path]: current };
  }
  const previous = pendingCollectionItems(collection, current.baseline, editedValues);
  const used = new Set<number>();
  const claimed = new Set<string>();
  const matched = value.map((item) => {
    const index = matchPreviousItem(item, previous, used, collection.key);
    if (index < 0) return null;
    used.add(index);
    const origin = current.origins[index] ?? null;
    if (origin) claimed.add(origin.identity);
    return origin;
  });
  const detached = [
    ...(current.detached ?? []),
    ...previous.flatMap((item, index): t.DetachedEntry[] => {
      const origin = current.origins[index];
      return !used.has(index) && origin ? [{ value: item, origin }] : [];
    }),
  ].filter(({ origin }) => !claimed.has(origin.identity));
  const origins = matched.map(
    (origin, index) => origin ?? reattachOrigin(value[index], detached, claimed, collection.key),
  );
  return {
    ...collections,
    [collection.path]: {
      baseline: current.baseline,
      origins,
      detached: detached.filter(({ origin }) => !claimed.has(origin.identity)),
    },
  };
}

/**
 * The entry ops for one collection: an upsert for each added or changed item
 * (keyed by the identity it was loaded with, with that loaded entry as the
 * baseline so only the edit is applied) and a remove for each loaded entry no
 * pending item came from. Items without a key are reported, not sent.
 */
export function diffCollection(
  collection: t.KeyedCollection,
  items: t.ConfigValue[],
  edit: t.CollectionEdit,
  normalize: (value: t.ConfigValue) => t.ConfigValue,
): { ops: t.ConfigChange[]; issues: t.ConfigIssue[] } {
  const ops: t.ConfigChange[] = [];
  const issues: t.ConfigIssue[] = [];
  const kept = new Set<string>();
  items.forEach((item, index) => {
    const origin = edit.origins[index] ?? null;
    if (origin) kept.add(origin.identity);
    if (item === undefined) return;
    const value = normalize(item);
    const key = getEntryKey(value, collection.key);
    if (key === undefined) {
      issues.push({
        path: `${collection.path}.${index}.${collection.key}`,
        code: 'required',
        message: 'is required',
        entryIdentity: origin?.identity,
        entryPath: collection.key,
      });
      return;
    }
    if (!origin) {
      ops.push({ op: 'upsertEntry', path: collection.path, key, identity: null, value, index });
      return;
    }
    const baseline = normalize(origin.baseline);
    if (isConfigValueEqual(value, baseline)) return;
    ops.push({
      op: 'upsertEntry',
      path: collection.path,
      key,
      identity: origin.identity,
      value,
      baseline,
    });
  });
  for (const entry of edit.baseline) {
    const identity = getEntryKey(entry, collection.key);
    if (identity !== undefined && !kept.has(identity)) {
      ops.push({ op: 'removeEntry', path: collection.path, key: identity, identity });
    }
  }
  return { ops, issues };
}

/**
 * Every pending edit as `ConfigChange` ops. Plain fields go through
 * `buildSavePayload` (normalized, unchanged edits dropped); keyed collections
 * (`endpoints.custom`, `modelSpecs.list`) become per-entry upserts and
 * removes keyed by each entry's loaded identity, never array positions; a
 * reset of a whole collection removes the target's own list; and pending
 * hides/unhides become tombstone ops.
 */
export function buildConfigChanges(
  touchedPaths: ReadonlySet<string>,
  editedValues: t.FlatConfigMap,
  schemaPaths: ReadonlySet<string>,
  context: t.ChangeContext,
): t.ConfigChangeSet {
  const plain: t.FlatConfigMap = {};
  const collectionPaths = new Set<string>();
  for (const [path, value] of Object.entries(editedValues)) {
    const collection = collectionOfPath(path);
    if (collection) collectionPaths.add(collection.path);
    else plain[path] = value;
  }
  const payload = buildSavePayload(touchedPaths, plain, schemaPaths, context);
  const ops: t.ConfigChange[] = [
    ...payload.saves.map(
      ({ fieldPath, value }): t.ConfigChange => ({
        op: 'set',
        path: fieldPath,
        value,
      }),
    ),
    ...payload.resets.map((path): t.ConfigChange => ({ op: 'reset', path })),
  ];
  const issues: t.ConfigIssue[] = [];
  const collections: t.PendingCollection[] = [];
  for (const path of collectionPaths) {
    const collection = getKeyedCollection(path)!;
    if (path in editedValues && editedValues[path] === undefined) {
      ops.push({ op: 'reset', path });
      continue;
    }
    const edit = context.collections[path] ?? captureCollectionEdit(collection, context.root);
    const items = pendingCollectionItems(collection, edit.baseline, editedValues);
    const normalize = (value: t.ConfigValue) =>
      normalizeEditValue(`${path}.0`, value, context.fields, schemaPaths);
    const diff = diffCollection(collection, items, edit, normalize);
    ops.push(...diff.ops);
    issues.push(...diff.issues);
    collections.push({ collection, items, edit });
  }
  for (const [path, visibility] of Object.entries(context.visibility ?? {})) {
    ops.push({ op: visibility === 'hide' ? 'tombstone' : 'untombstone', path });
  }
  return { ops, payload, issues, collections };
}

function isIndexEdit(
  arrayPath: string,
  prev: t.FlatConfigMap,
  structured: t.EditBaseline | undefined,
): boolean {
  if (structured) return structured.isArrayPath(arrayPath);
  return Array.isArray(prev[arrayPath]);
}

function matchesBaseline(
  path: string,
  value: t.ConfigValue,
  baseline: t.FlatConfigMap,
  structured: t.EditBaseline | undefined,
): boolean {
  if (structured) return isConfigValueEqual(value, valueOrSecretPreview(structured.root, path));
  const baselineValue = baseline[path];
  return (
    value === baselineValue ||
    (typeof value === 'object' &&
      typeof baselineValue === 'object' &&
      JSON.stringify(value) === JSON.stringify(baselineValue))
  );
}

/**
 * Whether any pending edit would change what is stored: each edit is compared
 * with the saved value as Save would store both (key/value pairs serialized,
 * blank draft rows and masked previews dropped), so an edit that only adds a
 * blank row, or puts a record or entry back as it was, leaves the page clean.
 */
export function hasEffectiveEdits(
  editedValues: t.FlatConfigMap,
  structured: t.EditBaseline | undefined,
): boolean {
  const paths = Object.keys(editedValues);
  if (!structured) return paths.length > 0;
  return paths.some((path) => {
    const saved = getValueAtPath(structured.root, path);
    const edited = editedValues[path];
    if (edited === undefined) return valueOrSecretPreview(structured.root, path) !== undefined;
    return !isConfigValueEqual(
      structured.normalize(path, edited),
      structured.normalize(path, saved),
    );
  });
}

/**
 * Records an edit in the pending edits. An edit that leaves the value as
 * saved removes the pending entry, so reverting a field clears the unsaved
 * state; with `structured`, that comparison walks the structured saved config
 * (array items and records included, key order ignored), and a numeric
 * segment is an array index only when the schema says the parent is an array
 * (an MCP server named `2024` is a record key). An edit inside a pending
 * reset, or inside a switch turned on (`schedules: true`), keeps that edit:
 * Save writes the two as one object. Values that differ only in ways Save ignores (a blank draft row) stay pending so the control keeps
 * showing them; `hasEffectiveEdits` tells whether anything would be saved.
 */
export function applyConfigEdit(
  prev: t.FlatConfigMap,
  path: string,
  value: t.ConfigValue,
  baseline: t.FlatConfigMap,
  baselineIntermediates: Set<string>,
  baselineContainerPaths: Set<string>,
  structured?: t.EditBaseline,
): t.FlatConfigMap {
  const rawIndexMatch = INDEXED_ARRAY_PATH_RE.exec(path);
  const indexMatch =
    rawIndexMatch && isIndexEdit(rawIndexMatch[1], prev, structured) ? rawIndexMatch : null;
  if (indexMatch) {
    const [, arrayPath, indexStr] = indexMatch;
    const pendingArray = prev[arrayPath];
    if (Array.isArray(pendingArray)) {
      const next = { ...prev };
      const arr = [...pendingArray];
      arr[Number(indexStr)] = value;
      next[arrayPath] = arr;
      for (const existing of Object.keys(next)) {
        if (existing.startsWith(`${arrayPath}.`)) delete next[existing];
      }
      return next;
    }
  }

  const match = matchesBaseline(path, value, baseline, structured);
  const isContainerDelete =
    value === undefined && (baselineIntermediates.has(path) || baselineContainerPaths.has(path));
  const hasPendingAncestorDelete = (() => {
    let lastDot = path.lastIndexOf('.');
    while (lastDot > 0) {
      const ancestor = path.slice(0, lastDot);
      if (ancestor in prev && prev[ancestor] === undefined) return true;
      lastDot = ancestor.lastIndexOf('.');
    }
    return false;
  })();
  if (match && !isContainerDelete && !hasPendingAncestorDelete) {
    const next = { ...prev };
    delete next[path];
    return next;
  }
  const next = { ...prev, [path]: value };
  if (Array.isArray(value)) {
    const prefix = `${path}.`;
    for (const k of Object.keys(next)) {
      if (k.startsWith(prefix) && INDEXED_ARRAY_PATH_RE.test(k)) delete next[k];
    }
  }
  if (indexMatch) delete next[indexMatch[1]];
  for (const existing of Object.keys(next)) {
    if (existing === path) continue;
    const newIsDescendant = path.startsWith(`${existing}.`);
    const newIsAncestor = existing.startsWith(`${path}.`);
    if (newIsDescendant && (next[existing] === undefined || next[existing] === true)) continue;
    if (newIsDescendant || newIsAncestor) {
      delete next[existing];
    }
  }
  return next;
}

/**
 * Merge indexed-array edits (entries whose flat path ends in `.<digit>`) into
 * a config tree. Each indexed edit's value replaces the array element at that
 * index; the array's parent path is auto-created if absent so newly-introduced
 * sections (e.g. `modelSpecs` not present in `librechat.yaml`) merge in at the
 * correct nesting level rather than getting written to the wrong parent. When
 * the container is a record (an MCP server named `2024`), the numeric segment
 * is a record key: the record keeps its shape and only that key changes.
 *
 * Skips an edit when an intermediate path holds a primitive or array value,
 * since overwriting those with a fresh object would silently destroy live
 * baseline data. Caller is responsible for filtering `editedValues` down to
 * indexed entries before passing.
 */
export function mergeIndexedArrayEdits(
  baseline: Record<string, t.ConfigValue>,
  indexedEdits: Array<[string, t.ConfigValue]>,
): Record<string, t.ConfigValue> {
  const merged = { ...baseline };
  for (const [path, value] of indexedEdits) {
    const segments = path.split('.');
    const indexSegment = segments.pop()!;
    const arrayPath = segments;
    let parent: Record<string, t.ConfigValue> = merged;
    let bailed = false;
    for (let i = 0; i < arrayPath.length - 1; i++) {
      const seg = arrayPath[i];
      const existing = parent[seg];
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        parent[seg] = { ...(existing as Record<string, t.ConfigValue>) };
      } else if (existing == null) {
        parent[seg] = {};
      } else {
        bailed = true;
        break;
      }
      parent = parent[seg] as Record<string, t.ConfigValue>;
    }
    if (bailed) continue;
    const lastSeg = arrayPath[arrayPath.length - 1];
    const container = parent[lastSeg];
    if (isConfigRecord(container)) {
      const record = { ...container };
      if (value === undefined) delete record[indexSegment];
      else record[indexSegment] = value;
      parent[lastSeg] = record;
      continue;
    }
    const arr = Array.isArray(container) ? [...container] : [];
    arr[Number(indexSegment)] = value;
    parent[lastSeg] = arr;
  }
  return merged;
}
