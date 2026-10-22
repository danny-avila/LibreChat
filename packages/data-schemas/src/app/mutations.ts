import type { TCustomConfig } from 'librechat-data-provider';
import type { ConfigPathSegments } from './paths';
import {
  setAtPath,
  unsetAtPath,
  isPlainRecord,
  isEffectivelyEmpty,
  formatTombstonePath,
  pruneEmptyAncestors,
  getClearedTombstones,
  isTombstoneAtOrBelow,
} from './paths';

/**
 * The part of a principal's config document that override mutations change. Every mutation in
 * this module is a pure transform of it: the result is a new state, and the input is untouched.
 * Persisting the result is the store's job, in one compare-and-swap write.
 */
export interface ConfigOverrideState {
  overrides: Partial<TCustomConfig>;
  /** Dotted paths that suppress inherited values during resolution. */
  tombstones: string[];
}

/** One field written by {@link setConfigFields}. */
export interface ConfigFieldWrite {
  segments: ConfigPathSegments;
  value: unknown;
}

type JsonRecord = { [key: string]: unknown };

export const EMPTY_CONFIG_OVERRIDE_STATE: Readonly<ConfigOverrideState> = Object.freeze({
  overrides: {},
  tombstones: [],
});

/** The mutable part of a stored document, or the empty state when there is none. */
export function toConfigOverrideState(
  document?: { overrides?: unknown; tombstones?: unknown } | null,
): ConfigOverrideState {
  const overrides = isPlainRecord(document?.overrides) ? document.overrides : {};
  const tombstones = Array.isArray(document?.tombstones)
    ? document.tombstones.filter((path): path is string => typeof path === 'string')
    : [];
  return { overrides: overrides as Partial<TCustomConfig>, tombstones };
}

function asRecord(overrides: Partial<TCustomConfig>): JsonRecord {
  return overrides as JsonRecord;
}

/**
 * Sets each field in order, then drops the tombstones the writes clear: each written path and
 * its ancestors below the section. A path that continues below a scalar or into a named key of
 * an array throws a `ConfigPathError` instead of replacing what is stored.
 */
export function setConfigFields(
  state: ConfigOverrideState,
  writes: readonly ConfigFieldWrite[],
): ConfigOverrideState {
  let overrides = asRecord(state.overrides);
  const cleared = new Set<string>();
  for (const { segments, value } of writes) {
    overrides = setAtPath(overrides, segments, value);
    for (const path of getClearedTombstones(segments)) {
      cleared.add(path);
    }
  }
  return {
    overrides: overrides as Partial<TCustomConfig>,
    tombstones: state.tombstones.filter((path) => !cleared.has(path)),
  };
}

/** Removes each path, then the objects the removals left empty. */
function removePaths(overrides: JsonRecord, paths: readonly ConfigPathSegments[]): JsonRecord {
  const removed = paths.reduce((current, segments) => unsetAtPath(current, segments), overrides);
  return paths.reduce((current, segments) => pruneEmptyAncestors(current, segments), removed);
}

/**
 * Removes each path and prunes the objects the removals left empty, so a reset leaves no `{}`
 * shells behind (sibling values and array elements are never removed). Tombstones at or below
 * each path are dropped too, and tombstones elsewhere, including under a pruned ancestor, stay.
 */
export function unsetConfigPaths(
  state: ConfigOverrideState,
  paths: readonly ConfigPathSegments[],
): ConfigOverrideState {
  return {
    overrides: removePaths(asRecord(state.overrides), paths) as Partial<TCustomConfig>,
    tombstones: state.tombstones.filter(
      (tombstone) => !paths.some((segments) => isTombstoneAtOrBelow(tombstone, segments)),
    ),
  };
}

/**
 * Suppresses each path: its override is removed (with the emptied ancestors, as in
 * {@link unsetConfigPaths}) and the path is recorded as a tombstone once. A segment that
 * contains a dot cannot be named by a tombstone and throws a `ConfigPathError`.
 */
export function tombstoneConfigPaths(
  state: ConfigOverrideState,
  paths: readonly ConfigPathSegments[],
): ConfigOverrideState {
  const added = paths.map(formatTombstonePath);
  const tombstones = [...state.tombstones];
  for (const path of added) {
    if (!tombstones.includes(path)) {
      tombstones.push(path);
    }
  }
  return {
    overrides: removePaths(asRecord(state.overrides), paths) as Partial<TCustomConfig>,
    tombstones,
  };
}

/** Replaces the overrides whole. Tombstones stay, so they keep shaping the inherited base. */
export function replaceConfigOverrides(
  state: ConfigOverrideState,
  overrides: Partial<TCustomConfig>,
): ConfigOverrideState {
  return { overrides, tombstones: [...state.tombstones] };
}

/**
 * Whether a document holds nothing: no tombstones, and overrides that are empty or hold only
 * empty objects (shells an older server's field reset left behind).
 */
export function isConfigOverrideStateEmpty(state: ConfigOverrideState): boolean {
  return state.tombstones.length === 0 && isEffectivelyEmpty(state.overrides);
}
