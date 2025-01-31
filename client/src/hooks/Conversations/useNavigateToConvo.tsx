import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, EModelEndpoint, LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const clearAllLatestMessages = store.useClearLatestMessages(`useNavigateToConvo ${index}`);
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const { hasSetConversation, setConversation } = store.useCreateConversationAtom(index);

  const navigateToConvo = (
    conversation?: TConversation | null,
    _resetLatestMessage = true,
    invalidateMessages = false,
  ) => {
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    hasSetConversation.current = true;
    setSubmission(null);
    if (_resetLatestMessage) {
      clearAllLatestMessages();
    }
    if (invalidateMessages && conversation.conversationId != null && conversation.conversationId) {
      queryClient.setQueryData([QueryKeys.messages, Constants.NEW_CONVO], []);
      queryClient.invalidateQueries([QueryKeys.messages, conversation.conversationId]);
    }

    let convo = { ...conversation };
    if (!convo.endpoint) {
      /* undefined endpoint edge case */
      const modelsConfig = queryClient.getQueryData<TModelsConfig>([QueryKeys.models]);
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
      const defaultEndpoint = getDefaultEndpoint({
        convoSetup: conversation,
        endpointsConfig,
      });

      const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
      if (!conversation.endpointType && endpointType) {
        conversation.endpointType = endpointType;
      }

      const models = modelsConfig?.[defaultEndpoint ?? ''] ?? [];

      convo = buildDefaultConvo({
        conversation,
        endpoint: defaultEndpoint,
        lastConversationSetup: conversation,
        models,
      });
    }
    clearAllConversations(true);
    setConversation(convo);
    navigate(`/c/${convo.conversationId ?? Constants.NEW_CONVO}`);
  };

  const navigateWithLastTools = (
    conversation?: TConversation | null,
    _resetLatestMessage?: boolean,
    invalidateMessages?: boolean,
  ) => {
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    // set conversation to the new conversation
    if (conversation.endpoint === EModelEndpoint.gptPlugins) {
      let lastSelectedTools = [];
      try {
        lastSelectedTools =
          JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '') ?? [];
      } catch (e) {
        // console.error(e);
      }
      const hasTools = (conversation.tools?.length ?? 0) > 0;
      navigateToConvo(
        {
          ...conversation,
          tools: hasTools ? conversation.tools : lastSelectedTools,
        },
        _resetLatestMessage,
        invalidateMessages,
      );
    } else {
      navigateToConvo(conversation, _resetLatestMessage, invalidateMessages);
    }
  };

  return {
    navigateToConvo,
    navigateWithLastTools,
  };
};

export default useNavigateToConvo;
