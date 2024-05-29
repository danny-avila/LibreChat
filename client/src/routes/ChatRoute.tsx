import { useRecoilState, useRecoilValue } from 'recoil';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { defaultOrderQuery } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { ConvoType, useGetConvoIdQuery, useListAssistantsQuery } from '~/data-provider';
import { useNewConvo, useConfigOverride, useAuthContext } from '~/hooks';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import { Spinner } from '~/components/svg';
import store from '~/store';

export default function ChatRoute({ convo = 'c' }: { convo: ConvoType }) {
  const index = 0;

  useConfigOverride();
  const { conversationId } = useParams();
  const { data: startupConfig } = useGetStartupConfig();
  const [convoType, setConvoType] = useRecoilState(store.convoType);
  const navigate = useNavigate();
  const { user } = useAuthContext();
  if ((convo === 'c' || conversationId === 'new') && user?.username === 'guest-user') {
    navigate('/login');
  }

  const { conversation } = store.useCreateConversationAtom(index);
  const modelsQueryEnabled = useRecoilValue(store.modelsQueryEnabled);
  const { isAuthenticated } = useAuthRedirect();
  const { newConversation } = useNewConvo();
  const hasSetConversation = useRef(false);

  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated && modelsQueryEnabled });
  const initialConvoQuery = useGetConvoIdQuery(conversationId ?? '', {
    enabled: isAuthenticated && conversationId !== 'new',
  });
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated && modelsQueryEnabled });
  const { data: assistants = null } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) =>
      res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
  });

  useEffect(() => {
    setConvoType(convo);
  }, [convo, setConvoType]);

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
      !hasSetConversation.current
    ) {
      newConversation({ modelsData: modelsQuery.data });
      hasSetConversation.current = !!assistants;
    } else if (
      initialConvoQuery.data &&
      endpointsQuery.data &&
      modelsQuery.data &&
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
    } else if (!hasSetConversation.current && conversationId === 'new' && assistants) {
      newConversation({ modelsData: modelsQuery.data });
      hasSetConversation.current = true;
    } else if (!hasSetConversation.current && assistants) {
      newConversation({
        template: initialConvoQuery.data,
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvoQuery.data, modelsQuery.data, endpointsQuery.data, assistants]);

  if (endpointsQuery.isLoading || modelsQuery.isLoading) {
    return <Spinner className="m-auto text-black dark:text-white" />;
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
    <>
      {convoType === 'r' && (
        <Helmet>
          <title>{conversation?.title ?? 'ChatG chat group'}</title>
          <meta property="og:title" content={conversation?.title ?? 'ChatG chat group'} />
          <meta
            property="og:description"
            content="Join this AI chat group to start chatting now. Accept crypto tips for your chat contributions."
          />
          <meta property="og:image" content="https://chatg.com/chatglogo.svg" />
          <meta property="og:image:width" content="1024" />
          <meta property="og:image:height" content="1024" />
          <meta property="og:url" content={`https://app.chatg.com/r/${conversationId}`} />
          <meta property="og:type" content="website" />
        </Helmet>
      )}
      <ChatView index={index} />
    </>
  );
}
