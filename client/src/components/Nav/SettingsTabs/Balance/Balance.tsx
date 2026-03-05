import React from 'react';
import { Label } from '@librechat/client';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  // Pull out all the fields we need, with safe defaults
  const {
    tokenCredits = 0,
    autoRefillEnabled = false,
    lastRefill,
    refillAmount,
    refillIntervalUnit,
    refillIntervalValue,
    perModelSpecTokenCredits,
  } = balanceData ?? {};

  // Check that all auto-refill props are present
  const hasValidRefillSettings =
    lastRefill !== undefined &&
    refillAmount !== undefined &&
    refillIntervalUnit !== undefined &&
    refillIntervalValue !== undefined;

  const specBalanceItems = (startupConfig?.modelSpecs?.list ?? [])
    .filter((spec) => spec.balance?.enabled === true)
    .map((spec) => ({
      label: spec.label,
      credits: perModelSpecTokenCredits?.[spec.name] ?? 0,
    }));

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Token credits display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />
      {/* Auto-refill display */}
      {autoRefillEnabled ? (
        hasValidRefillSettings ? (
          <AutoRefillSettings
            lastRefill={lastRefill}
            refillAmount={refillAmount}
            refillIntervalUnit={refillIntervalUnit}
            refillIntervalValue={refillIntervalValue}
          />
        ) : (
          <div className="text-sm text-red-600">
            {localize('com_nav_balance_auto_refill_error')}
          </div>
        )
      ) : (
        <div className="text-sm text-gray-600">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
      {/* Per-modelSpec balances */}
      {specBalanceItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label className="font-medium">{localize('com_nav_balance_model_specs')}</Label>
          {specBalanceItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <Label className="font-light">{item.label}</Label>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200" role="note">
                {item.credits.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
