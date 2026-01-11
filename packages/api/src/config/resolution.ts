import deepmerge from 'deepmerge';
import { logger } from '@librechat/data-schemas';
import type { IConfig, AppConfig } from '@librechat/data-schemas';

/**
 * Merge multiple configs in priority order
 * @param baseConfig - The base AppConfig from AppService
 * @param configs - Array of config documents from DB
 * @returns The merged AppConfig
 */
function mergeConfigsFromDB(baseConfig: AppConfig, configs: IConfig[]): AppConfig {
  // Sort by priority (ascending - lowest to highest)
  const sortedConfigs = [...configs].sort((a, b) => a.priority - b.priority);

  let finalConfig = { ...baseConfig };

  for (const config of sortedConfigs) {
    const source = `${config.principalType}:${config.principalId}`;

    logger.debug(
      `[configResolution] Applying config from: ${source} (priority: ${config.priority})`,
    );
    finalConfig = deepmerge(finalConfig, config.overrides);
  }

  return finalConfig;
}

/**
 * Build the final merged configuration
 * @param params - Parameters object
 * @param params.baseConfig - The base AppConfig from AppService (always fresh)
 * @param params.cachedConfigs - Cached DB configs to merge
 * @returns The merged AppConfig
 */
export async function buildUserConfig({
  baseConfig,
  cachedConfigs,
}: {
  baseConfig: AppConfig;
  cachedConfigs: IConfig[];
}): Promise<AppConfig> {
  if (!cachedConfigs || cachedConfigs.length === 0) {
    return baseConfig;
  }

  logger.debug(`[configResolution] Merging ${cachedConfigs.length} config(s) with base config`);

  // Merge fresh baseConfig with configs
  return mergeConfigsFromDB(baseConfig, cachedConfigs);
}
