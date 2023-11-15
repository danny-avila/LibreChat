import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { buildTree } from '~/utils';
import { useSSE } from '~/hooks';
import store from '~/store';

export default function ChatRoute() {
  const index = 0;
  const { conversationId } = useParams();
  const conversation = useRecoilValue(store.conversationByIndex(index));
  const submissionAtIndex = useRecoilValue(store.submissionByIndex(0));
  useSSE(submissionAtIndex);

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
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

  return (
    <ChatView
      index={index}
      messagesTree={messagesTree}
      isLoading={isLoading && conversationId !== 'new'}
    />
  );
}
