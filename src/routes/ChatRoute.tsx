import { useParams } from 'react-router-dom';
import { useNewConvo, useConfigOverride } from '~/hooks';
import ChatView from '~/components/Chat/ChatView';
import { useAuthStore } from '~/zustand';

export default function ChatRoute() {
  const index = 0;
  useConfigOverride();
  const { conversationId } = useParams();

  const { isAuthenticated } = useAuthStore();
  const { newConversation } = useNewConvo();

  // if (endpointsQuery.isLoading || modelsQuery.isLoading) {
  //   return (<Spinner className="m-auto dark:text-white" />);
  // }

  if (!isAuthenticated()) {
    return null;
  }

  return <ChatView index={index} />;
}
