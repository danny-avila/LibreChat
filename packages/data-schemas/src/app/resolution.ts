import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig, IConfig } from '~/types';

type AnyObject = { [key: string]: unknown };

const MAX_MERGE_DEPTH = 10;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

function deepMerge<T extends AnyObject>(target: T, source: AnyObject, depth = 0): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) {
      continue;
    }
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
      result[key] = deepMerge(targetVal as AnyObject, sourceVal as AnyObject, depth + 1);
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
        remapped[OVERRIDE_KEY_MAP[key as keyof typeof OVERRIDE_KEY_MAP] ?? key] = value;
      }
      merged = deepMerge(merged, remapped);
    }
  }

  return merged;
}
