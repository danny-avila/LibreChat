import React, { useState, useCallback, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import { useOnClickOutside } from '~/hooks';
import { RevokeKeysButton } from './RevokeKeysButton';
import { DeleteCacheButton } from './DeleteCacheButton';
import ImportConversations from './ImportConversations';

function Data() {
  return (
    <Tabs.Content
      value={SettingsTabValues.DATA}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <RevokeKeysButton all={true} />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <DeleteCacheButton />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ImportConversations />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Data);
