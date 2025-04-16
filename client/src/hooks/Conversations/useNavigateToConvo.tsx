import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  Constants,
  dataService,
  EModelEndpoint,
  LocalStorageKeys,
} from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField, logger } from '~/utils';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const clearAllLatestMessages = store.useClearLatestMessages(`useNavigateToConvo ${index}`);
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const { hasSetConversation, setConversation } = store.useCreateConversationAtom(index);

  const fetchFreshData = async (conversationId?: string | null) => {
    if (!conversationId) {
      return;
    }
    try {
      const data = await queryClient.fetchQuery([QueryKeys.conversation, conversationId], () =>
        dataService.getConversationById(conversationId),
      );
      logger.log('conversation', 'Fetched fresh conversation data', data);
      setConversation(data);
    } catch (error) {
      console.error('Error fetching conversation data on navigation', error);
    }
  };

  const navigateToConvo = (
    conversation?: TConversation | null,
    _resetLatestMessage = true,
    invalidateMessages = false,
  ) => {
    if (!conversation) {
      logger.warn('conversation', 'Conversation not provided to `navigateToConvo`');
      return;
    }
    logger.log('conversation', 'Navigating to conversation', conversation);
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
    const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
    if (!convo.endpoint || !endpointsConfig?.[convo.endpoint]) {
      /* undefined/removed endpoint edge case */
      const modelsConfig = queryClient.getQueryData<TModelsConfig>([QueryKeys.models]);
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
        models,
        conversation,
        endpoint: defaultEndpoint,
        lastConversationSetup: conversation,
      });
    }
    clearAllConversations(true);
    setConversation(convo);
    navigate(`/c/${convo.conversationId ?? Constants.NEW_CONVO}`);
    if (convo.conversationId !== Constants.NEW_CONVO && convo.conversationId) {
      queryClient.invalidateQueries([QueryKeys.conversation, convo.conversationId]);
      fetchFreshData(convo.conversationId);
    }
  };

  const navigateWithLastTools = (
    conversation?: TConversation | null,
    _resetLatestMessage?: boolean,
    invalidateMessages?: boolean,
  ) => {
    if (!conversation) {
      logger.warn('conversation', 'Conversation not provided to `navigateToConvo`');
      return;
    }
    // set conversation to the new conversation
    if (conversation.endpoint === EModelEndpoint.gptPlugins) {
      let lastSelectedTools = [];
      try {
        lastSelectedTools =
          JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '') ?? [];
      } catch (e) {
        logger.error('conversation', 'Error parsing last selected tools', e);
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
