/* eslint-disable indent */
import { memo, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
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
import { isYou } from '~/utils/checkUserValid';
import { TConversation, TUser } from 'librechat-data-provider';

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const submissionAtIndex = useRecoilValue(store.submissionByIndex(0));
  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);
  const [hideSidePanel, setHideSidePanel] = useRecoilState(store.hideSidePanel);

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
  const { conversation, setConversation } = chatHelpers;
  useRoomUsers(conversationId, socket);

  useEffect(() => {
    if (
      convoType === 'r' &&
      !isYou(user as TUser, conversation as TConversation) &&
      conversation?.isPrivate
    ) {
      setHideSidePanel(true);
    } else {
      setHideSidePanel(false);
    }
  }, [convoType, setHideSidePanel, user, conversation]);

  return (
    <ChatContext.Provider value={chatHelpers}>
      <Presentation useSidePanel={true}>
        {isLoading && conversationId !== 'new' ? (
          <div className="flex h-screen items-center justify-center">
            <Spinner className="opacity-0" />
          </div>
        ) : convoType === 'r' &&
          !isYou(user as TUser, conversation as TConversation) &&
          conversation?.isPrivate ? (
          <div className="flex h-screen flex-col items-center justify-center text-2xl font-bold text-black dark:text-white">
            <p className="mb-3 text-4xl">{conversation.title}</p>
            <p className="text-sm font-thin">This is private channel.</p>
          </div>
        ) : messagesTree && messagesTree.length !== 0 ? (
          <MessagesView messagesTree={messagesTree} Header={<Header />} />
        ) : (
          <Landing Header={<Header />} />
        )}
        {!isLoading && (
          <div className="w-full border-t-0 pl-0 pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
            {convoType === 'r' && isYou(user, conversation) && (
              <p className="stretch mx-2 flex flex-row gap-3 pl-3 text-black last:mb-2 dark:text-white md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl">
                To chat with AI models please add a / before your message
              </p>
            )}
            {convoType === 'c' ? (
              <ChatForm index={index} />
            ) : user && conversation && isYou(user, conversation) ? (
              <ChatForm index={index} />
            ) : (
              <ContinueChat conversation={conversation} setConversation={setConversation} />
            )}
            <Footer />
          </div>
        )}
      </Presentation>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
