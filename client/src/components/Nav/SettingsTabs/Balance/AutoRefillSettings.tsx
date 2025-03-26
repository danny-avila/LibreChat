import React from 'react';
import { TranslationKeys, useLocalize } from '~/hooks';
import { Label } from '~/components';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';

interface AutoRefillSettingsProps {
  lastRefill: Date;
  refillAmount: number;
  refillIntervalUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  refillIntervalValue: number;
}

/**
 * Adds a time interval to a given date.
 * @param {Date} date - The starting date.
 * @param {number} value - The numeric value of the interval.
 * @param {'seconds'|'minutes'|'hours'|'days'|'weeks'|'months'} unit - The unit of time.
 * @returns {Date} A new Date representing the starting date plus the interval.
 */
const addIntervalToDate = (
  date: Date,
  value: number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months',
): Date => {
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

const AutoRefillSettings: React.FC<AutoRefillSettingsProps> = ({
  lastRefill,
  refillAmount,
  refillIntervalUnit,
  refillIntervalValue,
}) => {
  const localize = useLocalize();

  const lastRefillDate = lastRefill ? new Date(lastRefill) : null;
  const nextRefill = lastRefillDate
    ? addIntervalToDate(lastRefillDate, refillIntervalValue, refillIntervalUnit)
    : null;

  // Return the localized unit based on singular/plural values
  const getLocalizedIntervalUnit = (
    value: number,
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months',
  ): string => {
    let key: TranslationKeys;
    switch (unit) {
      case 'seconds':
        key = value === 1 ? 'com_nav_balance_second' : 'com_nav_balance_seconds';
        break;
      case 'minutes':
        key = value === 1 ? 'com_nav_balance_minute' : 'com_nav_balance_minutes';
        break;
      case 'hours':
        key = value === 1 ? 'com_nav_balance_hour' : 'com_nav_balance_hours';
        break;
      case 'days':
        key = value === 1 ? 'com_nav_balance_day' : 'com_nav_balance_days';
        break;
      case 'weeks':
        key = value === 1 ? 'com_nav_balance_week' : 'com_nav_balance_weeks';
        break;
      case 'months':
        key = value === 1 ? 'com_nav_balance_month' : 'com_nav_balance_months';
        break;
      default:
        key = 'com_nav_balance_seconds';
    }
    return localize(key);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{localize('com_nav_balance_auto_refill_settings')}</h3>
      <div className="mb-1 flex justify-between text-sm">
        <span>{localize('com_nav_balance_last_refill')}</span>
        <span>{lastRefillDate ? lastRefillDate.toLocaleString() : '-'}</span>
      </div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{localize('com_nav_balance_refill_amount')}</span>
        <span>{refillAmount !== undefined ? refillAmount : '-'}</span>
      </div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{localize('com_nav_balance_interval')}</span>
        <span>
          {localize('com_nav_balance_every')} {refillIntervalValue}{' '}
          {getLocalizedIntervalUnit(refillIntervalValue, refillIntervalUnit)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        {/* Left Section: Label */}
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_nav_balance_next_refill')}</Label>
          <HoverCardSettings side="bottom" text="com_nav_balance_next_refill_info" />
        </div>

        {/* Right Section: tokenCredits Value */}
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200" role="note">
          {nextRefill ? nextRefill.toLocaleString() : '-'}
        </span>
      </div>
    </div>
  );
};

export default AutoRefillSettings;
