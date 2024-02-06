import { memo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import MessagesView from './Messages/MessagesView';
import OptionsBar from './Input/OptionsBar';
import CreationPanel from './CreationPanel';
import { ChatContext } from '~/Providers';
import { useChatHelpers } from '~/hooks';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';

function ChatView({
  messagesTree,
  index = 0,
}: {
  messagesTree?: TMessage[] | null;
  index?: number;
}) {
  return (
    <ChatContext.Provider value={useChatHelpers(index)}>
      <div className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
        <CreationPanel index={index} />
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-10 dark:bg-gray-800 md:pt-0">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {messagesTree && messagesTree.length !== 0 ? (
              <MessagesView messagesTree={messagesTree} Header={<Header />} />
            ) : (
              <Landing />
            )}
            <OptionsBar messagesTree={messagesTree} />
            <div className="gizmo:border-t-0 gizmo:pl-0 gizmo:md:pl-0 w-full border-t pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-2 md:pt-0 md:dark:border-transparent">
              <ChatForm index={index} />
            </div>
          </div>
        </div>
      </div>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
