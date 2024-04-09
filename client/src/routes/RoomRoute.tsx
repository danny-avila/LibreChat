import { useRecoilValue } from 'recoil';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { request } from 'librechat-data-provider';
import { useConfigOverride } from '~/hooks';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { Spinner } from '~/components/svg';
import store from '~/store';

export default function RoomRoute() {
  const index = 0;

  useConfigOverride();
  const { roomId } = useParams();
  const { data: startupConfig } = useGetStartupConfig();

  const navigate = useNavigate();

  const { conversation } = store.useCreateConversationAtom(index);
  const modelsQueryEnabled = useRecoilValue(store.modelsQueryEnabled);
  const { isAuthenticated } = useAuthRedirect();

  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated && modelsQueryEnabled });
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated && modelsQueryEnabled });

  useEffect(() => {
    if (startupConfig?.appTitle) {
      document.title = startupConfig.appTitle;
      localStorage.setItem('appTitle', startupConfig.appTitle);
    }
  }, [startupConfig]);

  useEffect(() => {
    getRoom();
  }, [roomId]);

  const getRoom = async () => {
    if (!roomId) {
      const room = await request.post(`/api/room/${roomId}`);
      console.log(room);
    } else {
      navigate('/c/new');
    }
  };

  if (endpointsQuery.isLoading || modelsQuery.isLoading) {
    return <Spinner className="m-auto text-black dark:text-white" />;
  }

  if (!isAuthenticated) {
    return null;
  }

  // if not a conversation
  if (conversation?.conversationId === 'search') {
    return null;
  }
  // if conversationId not match
  if (conversation?.conversationId !== roomId && !conversation) {
    return null;
  }
  // if conversationId is null
  if (!roomId) {
    return null;
  }

  return <ChatView index={index} />;
}
