import type * as t from '~/admin/types';
import { DEDICATED_CONFIG_SECTIONS, READ_ONLY_CONFIG_SECTIONS } from '~/admin/constants';
import { deepSerializeKVPairs, getValueAtPath, isConfigRecord } from './format';
import { collectLeafPaths, createPathIndex } from './paths';
import { mapSecretPreviewPaths } from './secrets';

/** Arrays LibreChat merges item by item on this key instead of replacing (`ARRAY_MERGE_KEYS`). */
export const ARRAY_MERGE_KEYS: Readonly<Record<string, string>> = { 'endpoints.custom': 'name' };

/** Objects an override replaces whole instead of merging into (`ATOMIC_MERGE_PATHS`). */
const ATOMIC_MERGE_PATHS: ReadonlySet<string> = new Set(['interface.theme']);

const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const INDEX_SEGMENT = /^\d+$/;

function mergeArrayByKey(
  target: t.ConfigValue[],
  source: t.ConfigValue[],
  keyField: string,
  path: string,
): t.ConfigValue[] {
  const sourceByKey = new Map<t.ConfigValue, t.ConfigRecord>();
  for (const item of source) {
    if (isConfigRecord(item) && item[keyField] != null) sourceByKey.set(item[keyField], item);
  }
  const seen = new Set<t.ConfigValue>();
  const result = target.map((item) => {
    if (!isConfigRecord(item)) return item;
    const override = item[keyField] != null ? sourceByKey.get(item[keyField]) : undefined;
    if (!override) return item;
    seen.add(item[keyField]);
    return mergeRecords(item, override, path);
  });
  for (const [key, item] of sourceByKey) {
    if (!seen.has(key)) result.push(item);
  }
  return result;
}

function mergeRecords(
  target: t.ConfigRecord,
  source: t.ConfigRecord,
  path: string,
): t.ConfigRecord {
  const result: t.ConfigRecord = { ...target };
  for (const key of Object.keys(source)) {
    if (UNSAFE_SEGMENTS.has(key)) continue;
    const childPath = path ? `${path}.${key}` : key;
    const sourceValue = source[key];
    const targetValue = result[key];
    if (
      isConfigRecord(sourceValue) &&
      isConfigRecord(targetValue) &&
      !ATOMIC_MERGE_PATHS.has(childPath)
    ) {
      result[key] = mergeRecords(targetValue, sourceValue, childPath);
    } else if (
      Array.isArray(sourceValue) &&
      Array.isArray(targetValue) &&
      Object.hasOwn(ARRAY_MERGE_KEYS, childPath)
    ) {
      result[key] = mergeArrayByKey(
        targetValue,
        sourceValue,
        ARRAY_MERGE_KEYS[childPath],
        childPath,
      );
    } else {
      result[key] = sourceValue;
    }
  }
  return result;
}

/** A copy of `tree` without the value at `path` (objects only, like LibreChat's tombstones). */
export function removeConfigPath(tree: t.ConfigRecord, path: string): t.ConfigRecord {
  const segments = path.split('.');
  if (segments.some((s) => UNSAFE_SEGMENTS.has(s))) return tree;
  const result: t.ConfigRecord = { ...tree };
  let cursor = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = cursor[segments[i]];
    if (!isConfigRecord(next)) return result;
    const cloned = { ...next };
    cursor[segments[i]] = cloned;
    cursor = cloned;
  }
  delete cursor[segments[segments.length - 1]];
  return result;
}

/**
 * A copy of `tree` with `value` at `path`, stepping into arrays by index and
 * creating missing objects. `undefined` removes the value.
 */
export function setConfigPath(
  tree: t.ConfigRecord,
  path: string,
  value: t.ConfigValue,
): t.ConfigRecord {
  const segments = path.split('.');
  if (segments.some((s) => UNSAFE_SEGMENTS.has(s))) return tree;
  const root: t.ConfigRecord = { ...tree };
  let cursor: t.ConfigRecord | t.ConfigValue[] = root;
  for (let i = 0; i < segments.length; i++) {
    if (Array.isArray(cursor) && !INDEX_SEGMENT.test(segments[i])) return tree;
    if (i === segments.length - 1) break;
    const segment = segments[i];
    const existing: t.ConfigValue = Array.isArray(cursor)
      ? cursor[Number(segment)]
      : cursor[segment];
    let next: t.ConfigRecord | t.ConfigValue[];
    if (Array.isArray(existing)) next = [...existing];
    else if (isConfigRecord(existing)) next = { ...existing };
    else next = {};
    if (Array.isArray(cursor)) cursor[Number(segment)] = next;
    else cursor[segment] = next;
    cursor = next;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    const index = Number(last);
    if (value === undefined) cursor.splice(index, 1);
    else cursor[index] = value;
  } else if (value === undefined) {
    delete cursor[last];
  } else {
    cursor[last] = value;
  }
  return root;
}

/**
 * The config a profile's members get, as far as one profile can tell: Base
 * (librechat.yaml plus base overrides) with the profile's overrides merged the
 * way LibreChat merges them (objects deep-merge, `endpoints.custom` merges by
 * name, other arrays are replaced) and its tombstoned paths removed. Sections a
 * profile cannot override keep their Base values.
 */
export function mergeScopeLayer(
  base: t.ConfigRecord,
  overrides: t.ConfigRecord,
  tombstones: Iterable<string> = [],
): t.ConfigRecord {
  const applicable: t.ConfigRecord = {};
  for (const [section, value] of Object.entries(overrides)) {
    if (READ_ONLY_CONFIG_SECTIONS.has(section) || DEDICATED_CONFIG_SECTIONS.has(section)) continue;
    applicable[section] = value;
  }
  let merged = mergeRecords(base, applicable, '');
  for (const path of tombstones) {
    if (READ_ONLY_CONFIG_SECTIONS.has(path.split('.')[0])) continue;
    merged = removeConfigPath(merged, path);
  }
  return merged;
}

function isStructuralEdit(value: t.ConfigValue): boolean {
  return value === undefined || Array.isArray(value) || isConfigRecord(value);
}

/**
 * Overlays pending structural edits (whole lists, entries, records, and
 * removals of them) onto a config tree so collection counts and the table of
 * contents match what the page shows. Pending primitive values are left to the
 * field controls, which read them through `getValue`/`useFieldState`. A
 * pending reset of a list or entry shows `revertAt(path)`, its fallback value.
 */
export function overlayPendingEdits(
  tree: t.ConfigRecord,
  edits: Array<[string, t.ConfigValue]>,
  revertAt: (path: string) => t.ConfigValue,
): t.ConfigRecord {
  let result = tree;
  for (const [path, edited] of edits) {
    if (!isStructuralEdit(edited)) continue;
    if (edited === undefined) {
      const current = getValueAtPath(result, path);
      if (!Array.isArray(current) && !isConfigRecord(current)) continue;
      result = setConfigPath(result, path, revertAt(path));
      continue;
    }
    result = setConfigPath(result, path, deepSerializeKVPairs(edited));
  }
  return result;
}

/**
 * The base-mode value layers (EV-1) from the base config payload. Secret
 * preview companion paths (`apiKeyPreview`) count as their real secret path.
 */
export function createBaseLayers(
  data: t.BaseConfigData,
  schemaPaths: ReadonlySet<string>,
  runtimeDefaultAt?: (path: string) => t.ConfigValue,
): t.ValueLayers {
  const overrides = data.dbOverrides ?? {};
  return {
    schemaDefaults: data.schemaDefaults,
    runtimeDefaultAt,
    yamlEffective: data.yamlConfig ?? null,
    yamlPaths: createPathIndex(mapSecretPreviewPaths(data.yamlPaths, schemaPaths)),
    base: data.config,
    baseOverrides: overrides,
    baseOverridePaths: createPathIndex(
      mapSecretPreviewPaths(collectLeafPaths(overrides), schemaPaths),
    ),
    baseTombstones: new Set(data.dbTombstones),
    scope: null,
    effective: data.config,
  };
}

/** `layers` with the open profile on top: its overrides merged over Base, minus its tombstones (EV-5). */
export function withScopeLayer(
  layers: t.ValueLayers,
  scope: Pick<t.ScopeLayer, 'principalType' | 'name'>,
  data: t.ResolvedConfigData,
  schemaPaths: ReadonlySet<string>,
): t.ValueLayers {
  return {
    ...layers,
    scope: {
      principalType: scope.principalType,
      name: scope.name,
      overrides: data.overrides,
      overridePaths: createPathIndex(mapSecretPreviewPaths(data.changedPaths, schemaPaths)),
      tombstones: new Set(data.tombstones),
    },
    effective: mergeScopeLayer(layers.base ?? {}, data.overrides, data.tombstones),
  };
}
