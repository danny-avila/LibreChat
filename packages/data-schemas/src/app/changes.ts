import type { TCustomConfig } from 'librechat-data-provider';
import type { ConfigOverrideState } from './mutations';
import type { ConfigPathSegments } from './paths';
import {
  getAtPath,
  setAtPath,
  unsetAtPath,
  isPlainRecord,
  ConfigPathError,
  pruneEmptyAncestors,
  getClearedTombstones,
} from './paths';
import { setConfigFields, unsetConfigPaths, tombstoneConfigPaths } from './mutations';
import { getConfigArrayMergeKey } from './resolution';

/**
 * Atomic batches of override changes.
 *
 * Every change is a pure transform of a principal's {@link ConfigOverrideState}, applied in
 * array order to the decoded document, so a batch is one read, any number of changes, and one
 * compare-and-swap write. Nothing here knows how a document is stored: an engine only ever
 * sees the finished document.
 *
 * Each transform returns its input state unchanged (the same object) when it changes nothing,
 * so a caller can tell an effective change from a no-op by identity.
 */

/**
 * The most changes one batch may carry. It is a fixed part of the admin API contract rather
 * than a `librechat.yaml` setting: clients split larger saves against it, so it is the same on
 * every deployment. The 3 MB JSON body limit bounds a batch's size; this bounds its work, since
 * each change is checked, has its secrets resolved and is applied in turn within one request.
 */
export const MAX_CONFIG_CHANGE_OPS = 1000;

export type ConfigChange =
  /** Writes `value` at the path and clears the tombstones the write covers. */
  | { op: 'set'; segments: ConfigPathSegments; value: unknown }
  /** Removes the override at the path, its emptied parents, and tombstones at or below it. */
  | { op: 'unset'; segments: ConfigPathSegments }
  /** Removes the override at the path and records a tombstone that hides inherited values. */
  | { op: 'tombstone'; segments: ConfigPathSegments }
  /**
   * Replaces the principal's own entry of a merged-by-key array whose key matches the entry's
   * (every own entry with that key), or appends it. The array is created when missing.
   */
  | { op: 'upsertEntry'; segments: ConfigPathSegments; entry: Record<string, unknown> }
  /** Removes the principal's own entries of a merged-by-key array that have this key. */
  | { op: 'removeEntry'; segments: ConfigPathSegments; key: string }
  /**
   * Renames one of the principal's own entries, moving everything stored on it (encrypted
   * secrets included): an entry of a merged-by-key array gets a new key value in place, and a
   * record key is moved with its value, keeping the record's key order.
   */
  | { op: 'rename'; segments: ConfigPathSegments; from: string; to: string };

export type ConfigChangeKind = ConfigChange['op'];

/** Why an entry change cannot apply to the stored document. */
export type ConfigEntryErrorReason =
  /** The path holds neither a merged-by-key array nor (for a rename) an object. */
  | 'not_collection'
  /** The entry is not an object, or its key field is not a non-empty string. */
  | 'invalid_entry'
  /** A rename names an entry the principal does not have. */
  | 'entry_not_found'
  /** A rename's new key is already one of the principal's entries. */
  | 'entry_exists';

/**
 * An entry change that cannot apply to the document as stored. Like `ConfigPathError`, the
 * message never echoes submitted keys.
 */
export class ConfigEntryError extends Error {
  readonly code = 'CONFIG_ENTRY_INVALID';

  constructor(
    readonly segments: string[],
    readonly reason: ConfigEntryErrorReason,
  ) {
    super(`Config entry change cannot be applied: ${reason}`);
    this.name = 'ConfigEntryError';
  }
}

export function isConfigEntryError(error: unknown): error is ConfigEntryError {
  return (
    error instanceof ConfigEntryError ||
    (error instanceof Error && (error as { code?: unknown }).code === 'CONFIG_ENTRY_INVALID')
  );
}

type JsonRecord = { [key: string]: unknown };

/** Structural equality of JSON values; object key order does not matter. */
export function isSameConfigValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameConfigValue(item, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        isSameConfigValue(left[key], right[key]),
    )
  );
}

function hasPath(root: unknown, segments: ConfigPathSegments): boolean {
  const parent = segments.length > 1 ? getAtPath(root, segments.slice(0, -1)) : root;
  const key = segments[segments.length - 1];
  if (Array.isArray(parent)) {
    return /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < parent.length;
  }
  return isPlainRecord(parent) && Object.prototype.hasOwnProperty.call(parent, key);
}

function isSameState(left: ConfigOverrideState, right: ConfigOverrideState): boolean {
  return (
    left.overrides === right.overrides &&
    left.tombstones.length === right.tombstones.length &&
    left.tombstones.every((path, index) => path === right.tombstones[index])
  );
}

function asRecord(state: ConfigOverrideState): JsonRecord {
  return state.overrides as JsonRecord;
}

function withOverrides(state: ConfigOverrideState, overrides: JsonRecord): ConfigOverrideState {
  return { overrides: overrides as Partial<TCustomConfig>, tombstones: state.tombstones };
}

function applySet(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  value: unknown,
): ConfigOverrideState {
  const cleared = new Set(getClearedTombstones(segments));
  const unchanged =
    hasPath(state.overrides, segments) &&
    isSameConfigValue(getAtPath(state.overrides, segments), value) &&
    !state.tombstones.some((path) => cleared.has(path));
  return unchanged ? state : setConfigFields(state, [{ segments, value }]);
}

function keepIfSame(state: ConfigOverrideState, next: ConfigOverrideState): ConfigOverrideState {
  return isSameState(state, next) ? state : next;
}

/** The principal's own array at a merged-by-key path, `[]` when it has none. */
function readKeyedArray(state: ConfigOverrideState, segments: ConfigPathSegments): unknown[] {
  const current = getAtPath(state.overrides, segments);
  if (current === undefined) {
    return [];
  }
  if (!Array.isArray(current)) {
    throw new ConfigEntryError([...segments], 'not_collection');
  }
  return current;
}

function requireKeyField(segments: ConfigPathSegments): string {
  const keyField = getConfigArrayMergeKey(segments);
  if (!keyField) {
    throw new ConfigEntryError([...segments], 'not_collection');
  }
  return keyField;
}

function hasKey(item: unknown, keyField: string, key: string): boolean {
  return isPlainRecord(item) && item[keyField] === key;
}

/** The key of an entry written into a merged-by-key array. */
export function getConfigEntryKey(entry: unknown, keyField: string): string | undefined {
  if (!isPlainRecord(entry)) {
    return undefined;
  }
  const key = entry[keyField];
  return typeof key === 'string' && key !== '' ? key : undefined;
}

/** Writes `items` back at `segments`, removing the array (and emptied parents) once empty. */
function writeKeyedArray(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  items: unknown[],
): ConfigOverrideState {
  if (items.length > 0) {
    return withOverrides(state, setAtPath(asRecord(state), segments, items));
  }
  const removed = unsetAtPath(asRecord(state), segments);
  return withOverrides(state, pruneEmptyAncestors(removed, segments));
}

function applyUpsertEntry(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  entry: Record<string, unknown>,
): ConfigOverrideState {
  const keyField = requireKeyField(segments);
  const key = getConfigEntryKey(entry, keyField);
  if (key === undefined) {
    throw new ConfigEntryError([...segments], 'invalid_entry');
  }
  const items = readKeyedArray(state, segments);
  const index = items.findIndex((item) => hasKey(item, keyField, key));
  const next =
    index === -1
      ? [...items, entry]
      : items.flatMap((item, position) => {
          if (position === index) {
            return [entry];
          }
          return hasKey(item, keyField, key) ? [] : [item];
        });
  return isSameConfigValue(items, next) ? state : writeKeyedArray(state, segments, next);
}

function applyRemoveEntry(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  key: string,
): ConfigOverrideState {
  const keyField = requireKeyField(segments);
  const items = readKeyedArray(state, segments);
  const next = items.filter((item) => !hasKey(item, keyField, key));
  return next.length === items.length ? state : writeKeyedArray(state, segments, next);
}

function renameKeyedEntry(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  keyField: string,
  from: string,
  to: string,
): ConfigOverrideState {
  const items = readKeyedArray(state, segments);
  const index = items.findIndex((item) => hasKey(item, keyField, from));
  if (index === -1) {
    throw new ConfigEntryError([...segments], 'entry_not_found');
  }
  if (items.some((item) => hasKey(item, keyField, to))) {
    throw new ConfigEntryError([...segments], 'entry_exists');
  }
  const next = items.map((item) =>
    hasKey(item, keyField, from) ? { ...(item as JsonRecord), [keyField]: to } : item,
  );
  return writeKeyedArray(state, segments, next);
}

/** Moves record key `from` to `to`, keeping the key order. */
function renameRecordKey(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  from: string,
  to: string,
): ConfigOverrideState {
  const record = getAtPath(state.overrides, segments);
  if (record !== undefined && !isPlainRecord(record)) {
    throw new ConfigEntryError([...segments], 'not_collection');
  }
  if (!record || !Object.prototype.hasOwnProperty.call(record, from)) {
    throw new ConfigEntryError([...segments], 'entry_not_found');
  }
  if (Object.prototype.hasOwnProperty.call(record, to)) {
    throw new ConfigEntryError([...segments], 'entry_exists');
  }
  const renamed: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    /** Defined rather than assigned, so a `__proto__` key stays data. */
    Object.defineProperty(renamed, key === from ? to : key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  const cleared = new Set(getClearedTombstones([...segments, to]));
  return {
    overrides: setAtPath(asRecord(state), segments, renamed) as Partial<TCustomConfig>,
    tombstones: state.tombstones.filter((path) => !cleared.has(path)),
  };
}

function applyRename(
  state: ConfigOverrideState,
  segments: ConfigPathSegments,
  from: string,
  to: string,
): ConfigOverrideState {
  if (from === to) {
    return state;
  }
  if (from === '' || to === '') {
    throw new ConfigEntryError([...segments], 'invalid_entry');
  }
  const keyField = getConfigArrayMergeKey(segments);
  return keyField
    ? renameKeyedEntry(state, segments, keyField, from, to)
    : renameRecordKey(state, segments, from, to);
}

/**
 * Applies one change. A path the document cannot take throws a `ConfigPathError`; an entry
 * change that cannot apply throws a {@link ConfigEntryError}. Returns `state` itself when the
 * change leaves the document as it was.
 */
export function applyConfigChange(
  state: ConfigOverrideState,
  change: ConfigChange,
): ConfigOverrideState {
  if (change.segments.length === 0) {
    throw new ConfigPathError([], 'empty_path');
  }
  switch (change.op) {
    case 'set':
      return applySet(state, change.segments, change.value);
    case 'unset':
      return keepIfSame(state, unsetConfigPaths(state, [change.segments]));
    case 'tombstone':
      return keepIfSame(state, tombstoneConfigPaths(state, [change.segments]));
    case 'upsertEntry':
      return applyUpsertEntry(state, change.segments, change.entry);
    case 'removeEntry':
      return applyRemoveEntry(state, change.segments, change.key);
    case 'rename':
      return applyRename(state, change.segments, change.from, change.to);
    default: {
      const unknownChange: never = change;
      throw new Error(`Unknown config change: ${String((unknownChange as ConfigChange).op)}`);
    }
  }
}

/** The result of {@link applyConfigChanges}: the final state, and which changes had an effect. */
export interface ConfigChangesResult {
  state: ConfigOverrideState;
  /** `changed[i]` is whether change `i` altered the document it was applied to. */
  changed: boolean[];
}

/**
 * Applies changes in array order, each to the result of the one before, exactly as the same
 * changes sent one request at a time would. Throws on the first change that cannot apply,
 * leaving the input untouched.
 */
export function applyConfigChanges(
  state: ConfigOverrideState,
  changes: readonly ConfigChange[],
): ConfigChangesResult {
  const changed: boolean[] = [];
  let current = state;
  for (const change of changes) {
    const next = applyConfigChange(current, change);
    changed.push(next !== current);
    current = next;
  }
  return { state: current, changed };
}

/**
 * The paths a change writes, for attributing validation issues to it: the path itself, or for
 * an entry change, the entry (by its index in the resulting own array) or the collection. A
 * removed entry is gone, so `removeEntry` writes nothing an issue could sit on: the entries it
 * leaves are unchanged, and their existing issues must not block the removal.
 */
export function getConfigChangeWrittenPaths(
  change: ConfigChange,
  result: ConfigOverrideState,
): string[][] {
  const segments = [...change.segments];
  if (change.op === 'set' || change.op === 'unset' || change.op === 'tombstone') {
    return [segments];
  }
  if (change.op === 'removeEntry') {
    return [];
  }
  const keyField = getConfigArrayMergeKey(change.segments);
  if (change.op === 'rename' && !keyField) {
    return [
      [...segments, change.from],
      [...segments, change.to],
    ];
  }
  const key =
    change.op === 'rename' ? change.to : keyField && getConfigEntryKey(change.entry, keyField);
  const items = getAtPath(result.overrides, segments);
  const index =
    Array.isArray(items) && keyField && key
      ? items.findIndex((item) => hasKey(item, keyField, key))
      : -1;
  return index === -1 ? [segments] : [[...segments, String(index)]];
}
