import React from 'react';
import { Label, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { kebabCase } from 'lodash';

interface TokenCreditsItemProps {
  tokenCredits?: number;
  perSpecTokenCredits?: Record<string, number> | null;
}

const TokenCreditsItem: React.FC<TokenCreditsItemProps> = ({
  tokenCredits,
  perSpecTokenCredits,
}) => {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();

  let totalTokenCredits = tokenCredits;
  if (Object.keys(perSpecTokenCredits || {}).length > 0) {
    totalTokenCredits = Object.values(perSpecTokenCredits || {}).reduce(
      (acc, val) => acc + val,
      totalTokenCredits || 0,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Single total balance when no per-model breakdown */}
      {!perSpecTokenCredits && (
        <div className="flex grow items-center justify-between">
          {/* Left Section: Label */}
          <div className="flex items-center space-x-2">
            <Label className="font-light">{localize('com_nav_balance')}</Label>
            <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_balance')} />
          </div>

          {/* Right Section: tokenCredits Value */}
          <span
            className={`text-sm font-medium text-gray-800 dark:text-gray-200 ${tokenCredits === 0 ? 'text-red-600 dark:text-red-400' : ''}`}
            role="note"
          >
            {tokenCredits !== undefined ? tokenCredits.toFixed(2) : '0.00'}
          </span>
        </div>
      )}
      {/* Total Balance when per-model breakdown exists */}
      {perSpecTokenCredits && (
        <div className="flex grow items-center justify-between">
          <div className="flex items-center space-x-2">
            <Label className="font-light">{localize('com_nav_balance')}</Label>
            <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_balance')} />
          </div>

          {/* Right Section: total tokenCredits Value */}
          <span
            className={`text-sm font-medium text-gray-800 dark:text-gray-200 ${totalTokenCredits === 0 ? 'text-red-600 dark:text-red-400' : ''}`}
            role="note"
          >
            {totalTokenCredits !== undefined ? totalTokenCredits.toFixed(2) : '0.00'}
          </span>
        </div>
      )}
      {/* Per-model token credits breakdown */}
      {perSpecTokenCredits && Object.keys(perSpecTokenCredits).length > 0 && (
        <div className="flex flex-col gap-1">
          {startupConfig?.modelSpecs?.list.map((spec) => {
            const kebabCaseSpecName = kebabCase(spec.name);
            const credits = perSpecTokenCredits[kebabCaseSpecName] || 0;
            return (
              <div className="flex items-center justify-between" key={kebabCaseSpecName}>
                <span
                  key={kebabCaseSpecName}
                  className="text-sm text-gray-600 dark:text-gray-400"
                  role="note"
                >
                  {spec.label || spec.name}
                </span>
                <span
                  className={`text-sm text-gray-600 dark:text-gray-400 ${credits === 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                  role="note"
                >
                  {credits.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TokenCreditsItem;
