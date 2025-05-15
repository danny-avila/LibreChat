import React from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Token credits display */}
      <TokenCreditsItem tokenCredits={balanceData?.tokenCredits} />

      {/* Auto-refill display */}
      {balanceData?.autoRefillEnabled ? (
        <>
          <AutoRefillSettings
            lastRefill={balanceData.lastRefill!}
            refillAmount={balanceData.refillAmount!}
            refillIntervalUnit={balanceData.refillIntervalUnit!}
            refillIntervalValue={balanceData.refillIntervalValue!}
          />
        </>
      ) : (
        <div className="text-sm text-gray-600">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
