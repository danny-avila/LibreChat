import type { TBalanceResponse } from 'librechat-data-provider';

export type RefillIntervalUnit = NonNullable<TBalanceResponse['refillIntervalUnit']>;

const addIntervalToDate = (date: Date, value: number, unit: RefillIntervalUnit): Date => {
  const result = new Date(date);
  switch (unit) {
    case 'seconds':
      result.setSeconds(result.getSeconds() + value);
      break;
    case 'minutes':
      result.setMinutes(result.getMinutes() + value);
      break;
    case 'hours':
      result.setHours(result.getHours() + value);
      break;
    case 'days':
      result.setDate(result.getDate() + value);
      break;
    case 'weeks':
      result.setDate(result.getDate() + value * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() + value);
      break;
    default:
      break;
  }
  return result;
};

export const getNextRefillDate = (
  lastRefill: Date,
  value: number,
  unit: RefillIntervalUnit,
): Date => addIntervalToDate(lastRefill, value, unit);
