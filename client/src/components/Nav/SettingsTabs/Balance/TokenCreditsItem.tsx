import React from 'react';
import { Label } from '@librechat/client';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';
import { useLocalize } from '~/hooks';

interface TokenCreditsItemProps {
  tokenCredits?: number;
}

const TokenCreditsItem: React.FC<TokenCreditsItemProps> = ({ tokenCredits }) => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      {/* Left Section: Label */}
      <div className="flex items-center space-x-2">
        <Label className="font-light">{localize('com_nav_balance')}</Label>
        <HoverCardSettings side="bottom" text="com_nav_info_balance" />
      </div>

      {/* Right Section: tokenCredits Value */}
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200" role="note">
        {tokenCredits !== undefined ? tokenCredits.toFixed(2) : '0.00'}
      </span>
    </div>
  );
};

export default TokenCreditsItem;
