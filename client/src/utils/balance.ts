import type { RefillIntervalUnit } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

const intervalUnitKeys: Record<
  RefillIntervalUnit,
  { one: TranslationKeys; other: TranslationKeys }
> = {
  seconds: { one: 'com_nav_balance_second', other: 'com_nav_balance_seconds' },
  minutes: { one: 'com_nav_balance_minute', other: 'com_nav_balance_minutes' },
  hours: { one: 'com_nav_balance_hour', other: 'com_nav_balance_hours' },
  days: { one: 'com_nav_balance_day', other: 'com_nav_balance_days' },
  weeks: { one: 'com_nav_balance_week', other: 'com_nav_balance_weeks' },
  months: { one: 'com_nav_balance_month', other: 'com_nav_balance_months' },
};

/** Returns the localization key for a refill interval unit, pluralized by value. */
export function getRefillIntervalUnitKey(value: number, unit: RefillIntervalUnit): TranslationKeys {
  const keys = intervalUnitKeys[unit] ?? intervalUnitKeys.seconds;
  return value === 1 ? keys.one : keys.other;
}
