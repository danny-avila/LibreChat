import { isCronCadence } from 'librechat-data-provider';
import type { TScheduleCadence } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';

export type Meridiem = 'AM' | 'PM';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the server's default weekly day (Monday) when a weekly cadence omits
 *  daysOfWeek, so an API-created/migrated `frequency: 'weekly'` renders as weekly. */
const WEEKLY_DEFAULT_DAY = 1;

/** August 1st, 2021 was a Sunday; anchors day-of-week indices 0-6 to real dates */
const SUNDAY_UTC = Date.UTC(2021, 7, 1);

export const UTC_TIMEZONE = 'UTC';

export const to12Hour = (hour: number): { hour12: number; meridiem: Meridiem } => ({
  hour12: hour % 12 === 0 ? 12 : hour % 12,
  meridiem: hour >= 12 ? 'PM' : 'AM',
});

export const to24Hour = (hour12: number, meridiem: Meridiem): number =>
  meridiem === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;

export const formatScheduleTime = (hour: number, minute: number, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(2000, 0, 1, hour, minute),
  );

export const formatScheduleDay = (day: number, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(SUNDAY_UTC + day * DAY_MS),
  );

export const describeCadence = (
  cadence: TScheduleCadence,
  localize: LocalizeFunction,
  locale?: string,
): string => {
  if (isCronCadence(cadence)) {
    // Shown verbatim rather than translated into prose. A five-field expression can
    // say things no sentence template covers, and a wrong summary of the cadence a
    // user typed themselves is worse than the expression they already understand.
    return localize('com_ui_schedule_runs_cron', { expression: cadence.expression });
  }
  const { frequency, hour, minute, daysOfWeek } = cadence;
  if (frequency === 'hourly') {
    return localize('com_ui_schedule_runs_hourly', {
      minute: String(minute).padStart(2, '0'),
    });
  }

  const time = formatScheduleTime(hour, minute, locale);
  if (frequency === 'weekdays') {
    return localize('com_ui_schedule_runs_weekdays', { time });
  }
  if (frequency === 'weekly') {
    // A weekly cadence with no daysOfWeek is valid — the server fires it on the
    // default weekly day — so render it as weekly (not daily) using that same day.
    const effectiveDays =
      daysOfWeek != null && daysOfWeek.length > 0 ? daysOfWeek : [WEEKLY_DEFAULT_DAY];
    const days = effectiveDays.map((day) => formatScheduleDay(day, locale)).join(', ');
    return localize('com_ui_schedule_runs_weekly', { days, time });
  }
  return localize('com_ui_schedule_runs_daily', { time });
};

/** One previewed occurrence, in the schedule's own zone. */
export const formatRunInstant = (date: Date, timezone: string, locale?: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

export const resolveLocalTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || UTC_TIMEZONE;

/** The modern IANA names the runtime accepts but `supportedValuesOf` leaves out:
 *  that enumeration reports CLDR's legacy canonical forms (`Asia/Calcutta`,
 *  `Europe/Kiev`), so the name a user actually searches for would find nothing.
 *  This is tzdb's rename set, not every alias the runtime tolerates: deprecated
 *  links (`US/Eastern`, `Etc/GMT+5`) point at zones already listed under their
 *  canonical names, and offering them would duplicate each zone under a stale or
 *  sign-inverted spelling. Each entry is probed before inclusion, so an engine
 *  that rejects or already lists one simply drops it. */
const MODERN_ZONE_NAMES = [
  'Asia/Kolkata',
  'Europe/Kyiv',
  'Asia/Ho_Chi_Minh',
  'Asia/Yangon',
  'Asia/Kathmandu',
  'America/Nuuk',
  'Africa/Asmara',
  'Atlantic/Faroe',
  'Pacific/Chuuk',
  'Pacific/Pohnpei',
  'Pacific/Kanton',
  'America/Atikokan',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Catamarca',
  'America/Argentina/Cordoba',
  'America/Argentina/Jujuy',
  'America/Argentina/Mendoza',
  'America/Indiana/Indianapolis',
  'America/Kentucky/Louisville',
];

const zoneIsAccepted = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Every IANA zone the runtime knows, with the user's own zone and UTC pinned first.
 * `Intl.supportedValuesOf` is unavailable on older engines, so the pinned pair
 * doubles as the fallback list: a user who cannot browse zones can still keep the
 * one their schedule already uses.
 */
export const buildTimezoneOptions = (localTimezone: string, storedTimezone?: string): string[] => {
  const pinned = [localTimezone, UTC_TIMEZONE];
  if (storedTimezone != null && storedTimezone.length > 0) {
    pinned.push(storedTimezone);
  }
  const seen = new Set(pinned);
  const listed =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const rest = Array.from(
    new Set([
      ...listed,
      // Only when the engine could enumerate at all: the fallback list is the pinned
      // pair by design, and extra browsable names would not change that.
      ...(listed.length > 0 ? MODERN_ZONE_NAMES.filter(zoneIsAccepted) : []),
    ]),
  )
    .filter((zone) => !seen.has(zone))
    .sort();
  return [...seen, ...rest];
};

/** Keyed by locale and zone. The offsets exist to tell two similar NAMES apart, so
 *  serving one computed earlier in the session is fine even across a DST change,
 *  and it saves rebuilding ~400 `Intl.DateTimeFormat`s on every dialog open. */
const offsetCache = new Map<string, string>();

/** The zone's current offset, e.g. `GMT+2`, so two similar names are tellable apart. */
export const formatTimezoneOffset = (timezone: string, locale?: string): string => {
  const cacheKey = `${locale ?? ''}|${timezone}`;
  const cached = offsetCache.get(cacheKey);
  if (cached != null) {
    return cached;
  }
  let offset = '';
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    offset = '';
  }
  offsetCache.set(cacheKey, offset);
  return offset;
};
