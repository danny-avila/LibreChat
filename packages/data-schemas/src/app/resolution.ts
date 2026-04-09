import { INTERFACE_PERMISSION_FIELDS, PERMISSION_SUB_KEYS } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig, IConfig } from '~/types';

type AnyObject = { [key: string]: unknown };

const MAX_MERGE_DEPTH = 10;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Paths within the config tree where arrays of objects should be merged by
 * a key field rather than replaced wholesale. `deepMerge` matches items by
 * the given key, deep-merges matching pairs, preserves unmatched base items,
 * and appends new override-only items.
 *
 * Paths use AppConfig key names (post-OVERRIDE_KEY_MAP remapping),
 * not YAML-level key names. E.g. use `interfaceConfig.x`, not `interface.x`.
 */
const ARRAY_MERGE_KEYS: Record<string, string> = {
  'endpoints.custom': 'name',
};

/**
 * Maps YAML-level override keys (TCustomConfig) to their AppConfig equivalents.
 * Overrides are stored with YAML keys but merged into the already-processed AppConfig
 * where some fields have been renamed by AppService.
 *
 * When AppService renames a field, add the mapping here. Map entries are
 * type-checked: keys must be valid TCustomConfig fields, values must be
 * valid AppConfig fields. The runtime lookup casts string keys to satisfy
 * strict indexing — unknown keys safely fall through via the ?? fallback.
 */
const OVERRIDE_KEY_MAP: Partial<Record<keyof TCustomConfig, keyof AppConfig>> = {
  mcpServers: 'mcpConfig',
  interface: 'interfaceConfig',
  turnstile: 'turnstileConfig',
};

function mergeArrayByKey(
  target: AnyObject[],
  source: AnyObject[],
  keyField: string,
  depth: number,
  path: string,
): AnyObject[] {
  const sourceByKey = new Map<unknown, AnyObject>();
  for (const item of source) {
    if (item != null && typeof item === 'object') {
      const key = item[keyField];
      // Source items without a key value are skipped: no stable identity
      // for matching or appending. (Keyless target items are preserved as-is below.)
      if (key != null) {
        sourceByKey.set(key, item);
      }
    }
  }

  const result: AnyObject[] = [];
  const seen = new Set<unknown>();

  // Pass the array container path (not a per-element path) so item
  // properties build paths like 'endpoints.custom.baseURL' for any
  // nested ARRAY_MERGE_KEYS lookups.
  for (const item of target) {
    if (item != null && typeof item === 'object') {
      const key = item[keyField];
      const override = key != null ? sourceByKey.get(key) : undefined;
      if (override) {
        result.push(deepMerge(item, override, depth + 1, path));
        seen.add(key);
      } else {
        result.push({ ...item });
      }
    } else {
      result.push(item);
    }
  }

  for (const key of sourceByKey.keys()) {
    if (!seen.has(key)) {
      result.push(deepMerge({} as AnyObject, sourceByKey.get(key)!, depth + 1, path));
    }
  }

  return result;
}

function deepMerge<T extends AnyObject>(target: T, source: AnyObject, depth = 0, path = ''): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) {
      continue;
    }
    const currentPath = path ? `${path}.${key}` : key;
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      depth < MAX_MERGE_DEPTH &&
      sourceVal != null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal != null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as AnyObject,
        sourceVal as AnyObject,
        depth + 1,
        currentPath,
      );
    } else if (
      depth < MAX_MERGE_DEPTH &&
      Array.isArray(sourceVal) &&
      Array.isArray(targetVal) &&
      ARRAY_MERGE_KEYS[currentPath]
    ) {
      result[key] = mergeArrayByKey(
        targetVal as AnyObject[],
        sourceVal as AnyObject[],
        ARRAY_MERGE_KEYS[currentPath],
        depth,
        currentPath,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result as T;
}

/**
 * Merge DB config overrides into a base AppConfig.
 *
 * Configs are sorted by priority ascending (lowest first, highest wins).
 * Each config's `overrides` is deep-merged into the base config in order.
 */
export function mergeConfigOverrides(baseConfig: AppConfig, configs: IConfig[]): AppConfig {
  if (!configs || configs.length === 0) {
    return baseConfig;
  }

  const sorted = [...configs].sort((a, b) => a.priority - b.priority);

  let merged = { ...baseConfig };
  for (const config of sorted) {
    if (config.overrides && typeof config.overrides === 'object') {
      const remapped: AnyObject = {};
      for (const [key, value] of Object.entries(config.overrides)) {
        const mappedKey = OVERRIDE_KEY_MAP[key as keyof typeof OVERRIDE_KEY_MAP] ?? key;
        if (
          key === 'interface' &&
          value != null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          const filtered: AnyObject = {};
          for (const [field, fieldVal] of Object.entries(value as AnyObject)) {
            if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
              filtered[field] = fieldVal;
            } else if (
              fieldVal != null &&
              typeof fieldVal === 'object' &&
              !Array.isArray(fieldVal)
            ) {
              // Composite permission field (e.g. mcpServers): strip permission
              // sub-keys but preserve UI-only sub-keys like placeholder/trustCheckbox.
              const uiOnly: AnyObject = {};
              for (const [sub, subVal] of Object.entries(fieldVal as AnyObject)) {
                if (!PERMISSION_SUB_KEYS.has(sub)) {
                  uiOnly[sub] = subVal;
                }
              }
              if (Object.keys(uiOnly).length > 0) {
                filtered[field] = uiOnly;
              }
            }
            // boolean permission fields (e.g. runCode: false) are fully stripped
          }
          if (Object.keys(filtered).length > 0) {
            remapped[mappedKey] = filtered;
          }
        } else {
          remapped[mappedKey] = value;
        }
      }
      merged = deepMerge(merged, remapped);
    }
  }

  return merged;
}
