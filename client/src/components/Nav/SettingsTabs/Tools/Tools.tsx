import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import StableDiffusion from './StableDiffusion';

function Tools() {
  return (
    <Tabs.Content
      value={SettingsTabValues.TOOLS}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <StableDiffusion />
        </div>
      </div>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700"></div>
    </Tabs.Content>
  );
}

export default React.memo(Tools);
