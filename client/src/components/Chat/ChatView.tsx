import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider';
import { useChatHelpers, useDragHelpers, useSSE } from '~/hooks';
// import GenerationButtons from './Input/GenerationButtons';
import DragDropOverlay from './Input/Files/DragDropOverlay';
import MessagesView from './Messages/MessagesView';
// import OptionsBar from './Input/OptionsBar';
import { ChatContext } from '~/Providers';
import ChatForm from './Input/ChatForm';
import { Spinner } from '~/components';
import { buildTree } from '~/utils';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import store from '~/store';

function ChatView({
  // messagesTree,
  // isLoading,
  index = 0,
}: {
  // messagesTree?: TMessage[] | null;
  // isLoading: boolean;
  index?: number;
}) {
  const { conversationId } = useParams();
  const submissionAtIndex = useRecoilValue(store.submissionByIndex(0));
  useSSE(submissionAtIndex);

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: (data) => {
      const dataTree = buildTree(data, false);
      return dataTree?.length === 0 ? null : dataTree ?? null;
    },
  });
  const chatHelpers = useChatHelpers(index, conversationId);
  const { isOver, canDrop, drop } = useDragHelpers(chatHelpers.setFiles);
  const isActive = canDrop && isOver;
  return (
    <ChatContext.Provider value={chatHelpers}>
      <div
        ref={drop}
        className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800"
      >
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {isLoading && conversationId !== 'new' ? (
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
