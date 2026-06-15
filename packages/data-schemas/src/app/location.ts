import type { TCustomConfig, TLocationConfig } from 'librechat-data-provider';

/**
 * Resolves the `location` section of librechat.yaml into the runtime config.
 * Defaults to enabled when the section is omitted.
 */
export function loadLocationConfig(location: TCustomConfig['location']): TLocationConfig {
  if (!location) {
    return { enabled: true };
  }
  return {
    enabled: location.enabled ?? true,
    ...(location.geocoder?.endpoint ? { geocoder: { endpoint: location.geocoder.endpoint } } : {}),
  };
}
