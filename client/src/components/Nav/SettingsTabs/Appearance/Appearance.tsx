import { memo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import MessagesUISwitch from './MessagesUISwitch';

function Messages() {
  return (
    <Tabs.Content value={SettingsTabValues.APPEARANCE} role="tabpanel" className="md: w-full">
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <MessagesUISwitch />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default memo(Messages);
