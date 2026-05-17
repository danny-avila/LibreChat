/**
 * Returns the list of IANA timezones supported by the runtime, with the user's
 * detected zone hoisted to the top. Falls back to a curated common-zones list
 * when `Intl.supportedValuesOf` is unavailable.
 */
export function getSupportedTimezones(): string[] {
  const detected = getBrowserTimezone();
  let zones: string[] = [];

  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (input: string) => string[] }
  ).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    try {
      zones = supportedValuesOf('timeZone');
    } catch {
      zones = [];
    }
  }

  if (zones.length === 0) {
    zones = COMMON_TIMEZONES;
  }

  if (detected && !zones.includes(detected)) {
    zones = [detected, ...zones];
  } else if (detected) {
    zones = [detected, ...zones.filter((z) => z !== detected)];
  }

  return zones;
}

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];
