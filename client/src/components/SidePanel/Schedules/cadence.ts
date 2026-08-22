import { isCronCadence } from 'librechat-data-provider';
import type { TScheduleCadence } from 'librechat-data-provider';
import type { WeekStartDay } from '~/utils/clock';
import type { LocalizeFunction } from '~/common';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the server's default weekly day (Monday) when a weekly cadence omits
 *  daysOfWeek, so an API-created/migrated `frequency: 'weekly'` renders as weekly. */
const WEEKLY_DEFAULT_DAY = 1;

/** August 1st, 2021 was a Sunday; anchors day-of-week indices 0-6 to real dates */
const SUNDAY_UTC = Date.UTC(2021, 7, 1);

export const UTC_TIMEZONE = 'UTC';

export const formatScheduleTime = (
  hour: number,
  minute: number,
  locale?: string,
  hour12?: boolean,
): string =>
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12 }).format(
    new Date(2000, 0, 1, hour, minute),
  );

export const formatScheduleDay = (day: number, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(SUNDAY_UTC + day * DAY_MS),
  );

/** The pill label. The long name is still the accessible one: "Mon" reads fine at a
 *  glance but poorly aloud, and seven of them would not fit a phone-width row. */
export const formatScheduleDayShort = (day: number, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(SUNDAY_UTC + day * DAY_MS),
  );

export const describeCadence = (
  cadence: TScheduleCadence,
  localize: LocalizeFunction,
  locale?: string,
  hour12?: boolean,
  weekStartsOn: WeekStartDay = 0,
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

  const time = formatScheduleTime(hour, minute, locale, hour12);
  if (frequency === 'weekdays') {
    return localize('com_ui_schedule_runs_weekdays', { time });
  }
  if (frequency === 'weekly') {
    // A weekly cadence with no daysOfWeek is valid — the server fires it on the
    // default weekly day — so render it as weekly (not daily) using that same day.
    const effectiveDays =
      daysOfWeek != null && daysOfWeek.length > 0 ? daysOfWeek : [WEEKLY_DEFAULT_DAY];
    // Reads in the user's own week order (e.g. "Fri, Sat, Sun" when the week starts
    // Monday), not raw ascending Sunday-first, which would otherwise read a
    // wrap-around selection like Sat+Sun+Mon as "Sun, Mon, Sat".
    const sortedDays = [...effectiveDays].sort(
      (a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7),
    );
    const days = sortedDays.map((day) => formatScheduleDay(day, locale)).join(', ');
    return localize('com_ui_schedule_runs_weekly', { days, time });
  }
  return localize('com_ui_schedule_runs_daily', { time });
};

/** One previewed occurrence, in the schedule's own zone. */
export const formatRunInstant = (
  date: Date,
  timezone: string,
  locale?: string,
  hour12?: boolean,
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(date);

export const resolveLocalTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || UTC_TIMEZONE;

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
  const rest =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone').filter((zone) => !seen.has(zone))
      : [];
  return [...seen, ...rest];
};

/** The zone's current offset, e.g. `GMT+2`, so two similar names are tellable apart. */
export const formatTimezoneOffset = (timezone: string, locale?: string): string => {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
};
