import type { AppConfig, IConfig } from '~/types';

type AnyObject = { [key: string]: unknown };

/**
 * Deep merge source into target, returning a new object.
 * Arrays are replaced (not concatenated). Primitives from source override target.
 */
function deepMerge<T extends AnyObject>(target: T, source: AnyObject): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal != null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal != null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as AnyObject, sourceVal as AnyObject);
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
      merged = deepMerge(merged, config.overrides as AnyObject);
    }
  }

  return merged;
}
