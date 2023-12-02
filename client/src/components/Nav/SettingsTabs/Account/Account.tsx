import * as Tabs from '@radix-ui/react-tabs';
import ProfilePicture from './ProfilePicture';
import React from 'react';

function Account() {
  return (
    <Tabs.Content value="account" role="tabpanel" className="w-full md:min-h-[300px]">
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ProfilePicture />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Account);
