import { memo, useMemo, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider/react-query';
import { useVeraChat, useSSE } from '~/hooks';
// import GenerationButtons from './Input/GenerationButtons';
import MessagesView from './Messages/MessagesView';
// import OptionsBar from './Input/OptionsBar';
import { useGetFiles } from '~/data-provider';
import { buildTree, mapFiles } from '~/utils';
import { Spinner } from '~/components/svg';
import { ChatContext } from '~/Providers';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import store from '~/store';
import { useConversationEvents, useConversationMessages } from '~/services/queries/conversations';
import {
  buildMessageTreeFromEvents,
  buildMessageTreeFromMessages,
  buildMessagesFromEvents,
} from '~/utils/buildTree';
import { useAuthStore } from '~/zustand';

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const chatHelpers = useVeraChat(conversationId, conversationId);
  const { data = null, isLoading } = useConversationMessages(conversationId ?? ''); // 'c985dc60-0f72-4de4-a774-38b39dc22e19'
  const messagesTree = buildMessageTreeFromMessages({ messages: data });
  const submissionAtIndex = useRecoilValue(store.submissionByIndex(conversationId));
  useSSE(submissionAtIndex);

  return (
    <ChatContext.Provider value={chatHelpers}>
      <Presentation>
        {conversationId !== 'new' && isLoading ? (
          <div className="flex h-screen items-center justify-center">
            <Spinner color="black" />
          </div>
        ) : messagesTree && messagesTree.length !== 0 ? (
          <MessagesView messagesTree={messagesTree} Header={<Header />} />
        ) : (
          <Landing />
        )}
        {/* <OptionsBar messagesTree={messagesTree} /> */}
        {/* <GenerationButtons endpoint={chatHelpers.conversation.endpoint ?? ''} /> */}
        <div className="w-full border-t-0 pl-0 pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
          <ChatForm index={conversationId} />
          <Footer />
        </div>
      </Presentation>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
