import type { TUserLocation } from 'librechat-data-provider';

export interface FormatLocationOptions {
  /** Resolved admin feature flag (`librechat.yaml` location.enabled) */
  featureEnabled: boolean;
}

const NOT_SHARED = 'The user has not shared their location.';
const DISABLED = 'The location feature is disabled by the administrator.';

/**
 * Formats the user's stored location into a concise, model-friendly string.
 * Returns a graceful message when the feature is disabled or no location is shared.
 */
export function formatLocationToolResult(
  location: TUserLocation | undefined,
  options: FormatLocationOptions,
): string {
  if (!options.featureEnabled) {
    return DISABLED;
  }
  if (!location || location.enabled !== true) {
    return NOT_SHARED;
  }

  const place = location.manual?.trim() || location.place?.trim();
  const parts: string[] = [];
  if (place) {
    parts.push(`Location: ${place}`);
  }
  if (location.coordinates) {
    const { latitude, longitude } = location.coordinates;
    parts.push(`Coordinates: ${latitude}, ${longitude}`);
  }
  if (location.timezone) {
    parts.push(`Timezone: ${location.timezone}`);
  }

  if (parts.length === 0) {
    return NOT_SHARED;
  }
  return parts.join('\n');
}
