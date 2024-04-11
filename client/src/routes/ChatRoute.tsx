import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { defaultOrderQuery } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { useGetConvoIdQuery, useListAssistantsQuery } from '~/data-provider';
import { useNewConvo, useConfigOverride } from '~/hooks';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { Spinner } from '~/components/svg';
import store from '~/store';

export default function ChatRoute() {
  const index = 0;

  useConfigOverride();
  const { conversationId } = useParams();
  const { data: startupConfig } = useGetStartupConfig();

  const { conversation } = store.useCreateConversationAtom(index);
  const { isAuthenticated } = useAuthRedirect();
  const { newConversation } = useNewConvo();
  const hasSetConversation = useRef(false);

  const modelsQuery = useGetModelsQuery({
    enabled: isAuthenticated,
    refetchOnMount: 'always',
  });
  const initialConvoQuery = useGetConvoIdQuery(conversationId ?? '', {
    enabled: isAuthenticated && conversationId !== 'new',
  });
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated });
  const { data: assistants = null } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) =>
      res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
  });

  useEffect(() => {
    if (startupConfig?.appTitle) {
      document.title = startupConfig.appTitle;
      localStorage.setItem('appTitle', startupConfig.appTitle);
    }
  }, [startupConfig]);

  useEffect(() => {
    if (
      conversationId === 'new' &&
      endpointsQuery.data &&
      modelsQuery.data &&
      !modelsQuery.data?.initial &&
      !hasSetConversation.current
    ) {
      newConversation({ modelsData: modelsQuery.data });
      hasSetConversation.current = !!assistants;
    } else if (
      initialConvoQuery.data &&
      endpointsQuery.data &&
      modelsQuery.data &&
      !modelsQuery.data?.initial &&
      !hasSetConversation.current
    ) {
      newConversation({
        template: initialConvoQuery.data,
        /* this is necessary to load all existing settings */
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = !!assistants;
    } else if (
      !hasSetConversation.current &&
      !modelsQuery.data?.initial &&
      conversationId === 'new' &&
      assistants
    ) {
      newConversation({ modelsData: modelsQuery.data });
      hasSetConversation.current = true;
    } else if (!hasSetConversation.current && !modelsQuery.data?.initial && assistants) {
      newConversation({
        template: initialConvoQuery.data,
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    }
    /* Creates infinite render if all dependencies included */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvoQuery.data, endpointsQuery.data, modelsQuery.data, assistants]);

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
  if (conversation?.conversationId !== conversationId && !conversation) {
    return null;
  }
  // if conversationId is null
  if (!conversationId) {
    return null;
  }

  return <ChatView index={index} />;
}
