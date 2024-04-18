import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider/react-query';
import { ChatContext, useFileMapContext } from '~/Providers';
import MessagesView from './Messages/MessagesView';
import { useChatHelpers, useSSE } from '~/hooks';
import { Spinner } from '~/components/svg';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import { buildTree } from '~/utils';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import store from '~/store';
import { useChatSocket, useInitSocket } from '~/hooks/useChatSocket';
import useRoomUsers from '~/hooks/useRoomUsers';
import ContinueChat from './ContinueChat';

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const submissionAtIndex = useRecoilValue(store.submissionByIndex(0));
  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);

  const socket = useInitSocket();
  useChatSocket(socket);
  useSSE(submissionAtIndex, 0, socket);

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: (data) => {
      const dataTree = buildTree({ messages: data, fileMap });
      return dataTree?.length === 0 ? null : dataTree ?? null;
    },
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId, socket);
  const { conversation } = chatHelpers;
  const users = conversation ? conversation.users : [];
  useRoomUsers(conversationId, socket);
  console.log(user?.id);

  return (
    <ChatContext.Provider value={chatHelpers}>
      <Presentation useSidePanel={true}>
        {isLoading && conversationId !== 'new' ? (
          <div className="flex h-screen items-center justify-center">
            <Spinner className="opacity-0" />
          </div>
        ) : messagesTree && messagesTree.length !== 0 ? (
          <MessagesView messagesTree={messagesTree} Header={<Header />} />
        ) : (
          <Landing Header={<Header />} />
        )}
        <div className="w-full border-t-0 pl-0 pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
          {convoType === 'c' ? (
            <ChatForm index={index} />
          ) : users !== undefined &&
            (users?.map((u) => u._id).indexOf(user?.id) > -1 ||
              conversation?.user?._id === user?.id) ? (
            <ChatForm index={index} />
          ) : (
            <ContinueChat />
          )}
          <Footer />
        </div>
      </Presentation>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
