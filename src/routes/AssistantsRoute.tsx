import { useParams } from 'react-router-dom';
import ChatView from '~/components/Chat/SingleChatView';
import store from '~/store';
import { useAuthStore } from '~/zustand';

export default function AssistantsRoute() {
  console.log('assistants route');
  const index = 0;
  const { conversationId } = useParams();
  const { conversation } = store.useCreateConversationAtom(index);

  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated()) {
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
