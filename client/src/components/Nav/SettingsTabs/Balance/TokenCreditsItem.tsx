import React from 'react';
import { Label, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface TokenCreditsItemProps {
  tokenCredits?: number;
}

const TokenCreditsItem: React.FC<TokenCreditsItemProps> = ({ tokenCredits }) => {
  const localize = useLocalize();

  /**
   * FORMATTING LOGIC:
   * If tokenCredits is 5000000, this will display as "5,000,000"
   * If it's undefined or 0, it displays "0"
   */
  const formattedBalance = tokenCredits !== undefined 
    ? tokenCredits.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
    : '0';

  return (
    <div className="flex items-center justify-between w-full">
      {/* Left Section: Label and Info Icon */}
      <div className="flex items-center space-x-2">
        <Label className="text-sm font-medium text-text-secondary">
          {localize('com_nav_balance')}
        </Label>
        <InfoHoverCard 
          side={ESide.Bottom} 
          text={localize('com_nav_info_balance')} 
        />
      </div>

      {/* Right Section: The actual numeric value */}
      <div className="flex flex-col items-end">
        <span 
          className="text-lg font-bold text-text-primary tracking-tight" 
          role="note"
        >
          {formattedBalance}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
          Available Tokens
        </span>
      </div>
    </div>
  );
};

export default React.memo(TokenCreditsItem);
