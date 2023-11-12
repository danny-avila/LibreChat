import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';
import { buildTree } from '~/utils';
import ChatView from '~/components/Assistants/SingleChatView';
import store from '~/store';

export default function AssistantsRoute() {
  const index = 0;
  const { conversationId } = useParams();
  const { isAuthenticated } = useAuthContext();
  const conversation = useRecoilValue(store.conversationByIndex(index));

  const { data: messagesTree = null } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: !!(conversationId && conversationId !== 'new'),
    select: (data) => {
      const dataTree = buildTree(data, false);
      return dataTree?.length === 0 ? null : dataTree ?? null;
    },
  });

  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        navigate('/login', { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate]);

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
