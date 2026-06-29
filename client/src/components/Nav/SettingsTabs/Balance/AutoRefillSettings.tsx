import React from 'react';
import { Label, InfoHoverCard, ESide } from '@librechat/client';
import { getRefillEligibilityDate } from 'librechat-data-provider';

import type { RefillIntervalUnit, TBalanceResponse } from 'librechat-data-provider';

import { getRefillIntervalUnitKey } from '~/utils';
import { useLocalize } from '~/hooks';

interface AutoRefillSettingsProps {
  lastRefill: NonNullable<TBalanceResponse['lastRefill']>;
  refillAmount: number;
  refillIntervalUnit: RefillIntervalUnit;
  refillIntervalValue: number;
}

const AutoRefillSettings: React.FC<AutoRefillSettingsProps> = ({
  lastRefill,
  refillAmount,
  refillIntervalUnit,
  refillIntervalValue,
}) => {
  const localize = useLocalize();

  const lastRefillDate = lastRefill ? new Date(lastRefill) : null;
  const refillEligibilityDate = lastRefillDate
    ? getRefillEligibilityDate(lastRefillDate, refillIntervalValue, refillIntervalUnit)
    : null;

  const getLocalizedIntervalUnit = (value: number, unit: RefillIntervalUnit): string =>
    localize(getRefillIntervalUnitKey(value, unit));

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
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_nav_balance_next_refill')}</Label>
          <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_balance_next_refill_info')} />
        </div>

        <span className="text-sm font-medium text-gray-800 dark:text-gray-200" role="note">
          {refillEligibilityDate ? refillEligibilityDate.toLocaleString() : '-'}
        </span>
      </div>
    </div>
  );
};

export default AutoRefillSettings;
