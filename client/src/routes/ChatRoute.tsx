import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGetConvoIdQuery } from 'librechat-data-provider';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { useSetStorage } from '~/hooks';
import store from '~/store';

export default function ChatRoute() {
  const index = 0;
  const setStorage = useSetStorage();
  const { conversationId } = useParams();
  const { conversation, setConversation } = store.useCreateConversationAtom(index);
  const { isAuthenticated } = useAuthRedirect();
  const hasSetConversation = useRef(false);

  const initialConvoQuery = useGetConvoIdQuery(conversationId ?? '', {
    enabled: isAuthenticated && conversationId !== 'new',
  });

  useEffect(() => {
    if (initialConvoQuery.data && !hasSetConversation.current) {
      setStorage(initialConvoQuery.data);
      setConversation(initialConvoQuery.data);
      hasSetConversation.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvoQuery.data]);

  if (!isAuthenticated) {
    return null;
  }

  // if not a conversation
  if (conversation?.conversationId === 'search') {
    return null;
  }
  // if conversationId not match
  if (conversation?.conversationId !== conversationId && !conversation) {
    return null;
  }
  // if conversationId is null
  if (!conversationId) {
    return null;
  }

  return <ChatView index={index} />;
}
