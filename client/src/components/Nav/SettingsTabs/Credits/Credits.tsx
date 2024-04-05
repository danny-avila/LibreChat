import { memo } from 'react';

import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import UserLimitChart from './UserLimitChart';
import TopupSubscription from './TopupSubscription';
import TokenUsageChart from './TokenUsageChart';

function Credits() {
  return (
    <Tabs.Content
      value={SettingsTabValues.CREDITS}
      role="tabpanel"
      className="w-full outline-none md:min-h-[300px]"
    >
      <div className="mb-3 flex w-full items-center justify-around outline-none">
        <UserLimitChart />
        <TopupSubscription />
      </div>
      <div className="h-80 w-full">
        <TokenUsageChart />
      </div>
    </Tabs.Content>
  );
}

export default memo(Credits);
