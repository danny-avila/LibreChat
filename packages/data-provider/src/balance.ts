export const REFILL_INTERVAL_UNITS = [
  'seconds',
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
] as const;

export type RefillIntervalUnit = (typeof REFILL_INTERVAL_UNITS)[number];

function ensureExhaustive(value: never): void {
  void value;
}

export function getRefillEligibilityDate(
  lastRefill: Date,
  value: number,
  unit: RefillIntervalUnit,
): Date {
  const result = new Date(lastRefill);
  switch (unit) {
    case 'seconds':
      result.setSeconds(result.getSeconds() + value);
      return result;
    case 'minutes':
      result.setMinutes(result.getMinutes() + value);
      return result;
    case 'hours':
      result.setHours(result.getHours() + value);
      return result;
    case 'days':
      result.setDate(result.getDate() + value);
      return result;
    case 'weeks':
      result.setDate(result.getDate() + value * 7);
      return result;
    case 'months':
      result.setMonth(result.getMonth() + value);
      return result;
    default: {
      ensureExhaustive(unit);
      return result;
    }
  }
}
