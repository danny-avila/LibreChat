import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider/react-query';
import ChatView from '~/components/Chat/SingleChatView';
import useAuthRedirect from './useAuthRedirect';
import { buildTree } from '~/utils';
import store from '~/store';

export default function AssistantsRoute() {
  const index = 0;
  const { conversationId } = useParams();
  const { conversation } = store.useCreateConversationAtom(index);

  const { data: messagesTree = null } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: !!(conversationId && conversationId !== 'new'),
    select: (data) => {
      const dataTree = buildTree(data, false);
      return dataTree?.length === 0 ? null : dataTree ?? null;
    },
  });

  const { isAuthenticated } = useAuthRedirect();

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

  return <ChatView index={index} messagesTree={messagesTree} />;
}
