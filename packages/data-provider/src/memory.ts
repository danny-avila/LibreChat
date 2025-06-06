import type { TCustomConfig, TMemoryConfig } from './config';

/**
 * Loads the memory configuration and validates it
 * @param config - The memory configuration from librechat.yaml
 * @returns The validated memory configuration
 */
export function loadMemoryConfig(config: TCustomConfig['memory']): TMemoryConfig | undefined {
  if (!config) {
    return undefined;
  }

  // If disabled is explicitly true, return the config as-is
  if (config.disabled === true) {
    return config;
  }

  // Check if the agent configuration is valid
  const hasValidAgent =
    config.agent &&
    (('id' in config.agent && !!config.agent.id) ||
      ('provider' in config.agent &&
        'model' in config.agent &&
        !!config.agent.provider &&
        !!config.agent.model));

  // If agent config is invalid, treat as disabled
  if (!hasValidAgent) {
    return {
      ...config,
      disabled: true,
    };
  }

  return config;
}

/**
 * Checks if memory feature is enabled based on the configuration
 * @param config - The memory configuration
 * @returns True if memory is enabled, false otherwise
 */
export function isMemoryEnabled(config: TMemoryConfig | undefined): boolean {
  if (!config) {
    return false;
  }

  if (config.disabled === true) {
    return false;
  }

  // Check if agent configuration is valid
  const hasValidAgent =
    config.agent &&
    (('id' in config.agent && !!config.agent.id) ||
      ('provider' in config.agent &&
        'model' in config.agent &&
        !!config.agent.provider &&
        !!config.agent.model));

  return !!hasValidAgent;
}
