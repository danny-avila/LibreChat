import type { AppConfig } from '~/types';
import type { IConfig } from '~/types';

/**
 * Deep merge source into target, returning a new object.
 * Arrays are replaced (not concatenated). Primitives from source override target.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
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
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * Merge DB config overrides into a base AppConfig.
 *
 * Configs are sorted by priority ascending (lowest first, highest wins).
 * Each config's `overrides` is deep-merged into the base config in order.
 *
 * @param baseConfig - The base AppConfig from AppService (YAML-derived, cached)
 * @param configs - Array of Config documents from the DB
 * @returns Merged AppConfig with overrides applied
 */
export function mergeConfigOverrides(baseConfig: AppConfig, configs: IConfig[]): AppConfig {
  if (!configs || configs.length === 0) {
    return baseConfig;
  }

  const sorted = [...configs].sort((a, b) => a.priority - b.priority);

  let merged: Record<string, unknown> = { ...baseConfig } as unknown as Record<string, unknown>;
  for (const config of sorted) {
    if (config.overrides && typeof config.overrides === 'object') {
      merged = deepMerge(merged, config.overrides as unknown as Record<string, unknown>);
    }
  }

  return merged as unknown as AppConfig;
}
