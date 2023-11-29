import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGetConvoIdQuery, useGetModelsQuery } from 'librechat-data-provider';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { useNewConvo } from '~/hooks';
import store from '~/store';

export default function ChatRoute() {
  const index = 0;
  const { conversationId } = useParams();
  const { conversation } = store.useCreateConversationAtom(index);
  const { isAuthenticated } = useAuthRedirect();
  const { newConversation } = useNewConvo();
  const hasSetConversation = useRef(false);

  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated });
  const initialConvoQuery = useGetConvoIdQuery(conversationId ?? '', {
    enabled: isAuthenticated && conversationId !== 'new',
  });

  useEffect(() => {
    if (conversationId === 'new' && modelsQuery.data && !hasSetConversation.current) {
      newConversation({ modelsData: modelsQuery.data });
      hasSetConversation.current = true;
    } else if (initialConvoQuery.data && modelsQuery.data && !hasSetConversation.current) {
      newConversation({
        template: initialConvoQuery.data,
        modelsData: modelsQuery.data,
      });
      hasSetConversation.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvoQuery.data, modelsQuery.data]);

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
