import { memo } from 'react';
import { useParams } from 'react-router-dom';
import type { TMessage } from 'librechat-data-provider';
// import GenerationButtons from './Input/GenerationButtons';
import DragDropOverlay from './Input/Files/DragDropOverlay';
import { useChatHelpers, useDragHelpers } from '~/hooks';
import MessagesView from './Messages/MessagesView';
// import OptionsBar from './Input/OptionsBar';
import { ChatContext } from '~/Providers';
import ChatForm from './Input/ChatForm';
import { Spinner } from '~/components';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';

function ChatView({
  messagesTree,
  isLoading,
  index = 0,
}: {
  messagesTree?: TMessage[] | null;
  isLoading: boolean;
  index?: number;
}) {
  const { conversationId } = useParams();
  const chatHelpers = useChatHelpers(index, conversationId);
  const { isOver, canDrop, drop } = useDragHelpers(chatHelpers.setFiles);
  const isActive = canDrop && isOver;
  return (
    <ChatContext.Provider value={chatHelpers}>
      <div
        ref={drop}
        className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800"
      >
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-10 dark:bg-gray-800 md:pt-0">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {isLoading ? (
              <div className="flex h-screen items-center justify-center">
                <Spinner className="dark:text-white" />
              </div>
            ) : messagesTree && messagesTree.length !== 0 ? (
              <MessagesView messagesTree={messagesTree} Header={<Header />} />
            ) : (
              <Landing Header={<Header />} />
            )}
            {/* <OptionsBar messagesTree={messagesTree} /> */}
            {/* <GenerationButtons endpoint={chatHelpers.conversation.endpoint ?? ''} /> */}
            <div className="gizmo:border-t-0 gizmo:pl-0 gizmo:md:pl-0 w-full border-t pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-2 md:pt-0 md:dark:border-transparent">
              <ChatForm index={index} />
              <Footer />
            </div>
            {isActive && <DragDropOverlay />}
          </div>
        </div>
      </div>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
