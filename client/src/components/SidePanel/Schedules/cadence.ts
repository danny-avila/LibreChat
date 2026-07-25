import type { TScheduleCadence } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';

export type Meridiem = 'AM' | 'PM';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the server's default weekly day (Monday) when a weekly cadence omits
 *  daysOfWeek, so an API-created/migrated `frequency: 'weekly'` renders as weekly. */
const WEEKLY_DEFAULT_DAY = 1;

/** August 1st, 2021 was a Sunday; anchors day-of-week indices 0-6 to real dates */
const SUNDAY_UTC = Date.UTC(2021, 7, 1);

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
