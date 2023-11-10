import { useState, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useGetMessagesByConvoId,
  useGetConversationByIdMutation,
  useGetStartupConfig,
} from 'librechat-data-provider';
import { useAuthContext, useNewConvo } from '~/hooks';
import { buildTree } from '~/utils';
import ChatView from './SingleChatView';
import store from '~/store';

export default function AssistantsRoute() {
  const index = 0;
  const { isAuthenticated } = useAuthContext();
  const [shouldNavigate, setShouldNavigate] = useState(true);
  const [conversation, setConversation] = useRecoilState(store.conversationByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const { newConversation } = useNewConvo();
  const { conversationId } = useParams();

  const { data: messagesTree = null } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: !!(conversationId && conversationId !== 'new'),
    select: (data) => {
      const dataTree = buildTree(data, false);
      return dataTree?.length === 0 ? null : dataTree ?? null;
    },
  });

  const navigate = useNavigate();

  //disabled by default, we only enable it when messagesTree is null
  const getConversationMutation = useGetConversationByIdMutation(conversationId ?? '');
  const { data: config } = useGetStartupConfig();

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

  useEffect(() => {
    if (!isSubmitting && !shouldNavigate) {
      setShouldNavigate(true);
    }
  }, [shouldNavigate, isSubmitting]);

  // when conversation changed or conversationId (in url) changed
  useEffect(() => {
    // No current conversation and conversationId is 'new'
    if (conversation === null && conversationId === 'new') {
      newConversation();
      setShouldNavigate(true);
    }
    // No current conversation and conversationId exists
    else if (conversation === null && conversationId) {
      getConversationMutation.mutate(conversationId, {
        onSuccess: (data) => {
          console.log('Conversation fetched successfully');
          setConversation(data);
          setShouldNavigate(true);
        },
        onError: (error) => {
          console.error('Failed to fetch the conversation');
          console.error(error);
          navigate('/a/new');
          newConversation();
          setShouldNavigate(true);
        },
      });
    }
    // No current conversation and no conversationId
    else if (conversation === null) {
      navigate('/a/new');
      setShouldNavigate(true);
    }
    // Conversation change and isSubmitting
    else if (conversation?.conversationId !== conversationId && isSubmitting) {
      setShouldNavigate(false);
    }
    // conversationId (in url) should always follow conversation?.conversationId, unless conversation is null
    // messagesTree is null when user navigates, but not on page refresh, so we need to navigate in this case
    else if (conversation?.conversationId !== conversationId && !messagesTree) {
      if (shouldNavigate) {
        navigate(`/a/${conversation?.conversationId}`);
      } else {
        setShouldNavigate(true);
      }
    }
    document.title = conversation?.title || config?.appTitle || 'Chat';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, conversationId, config]);

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
