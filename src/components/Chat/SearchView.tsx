import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import MessagesView from './Messages/MessagesView';
import store from '~/store';

import Header from './Header';

function SearchView() {
  const searchResultMessagesTree = useRecoilValue(store.searchResultMessagesTree);

  return (
    <div className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
      <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
        <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
          <MessagesView messagesTree={searchResultMessagesTree} Header={<Header />} />
        </div>
      </div>
    </div>
  );
}

export default memo(SearchView);
