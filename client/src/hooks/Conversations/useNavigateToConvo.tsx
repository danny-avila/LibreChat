import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants, dataService, getEndpointField } from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TStartupConfig,
  TModelsConfig,
  TConversation,
} from 'librechat-data-provider';
import {
  clearModelForNonEphemeralAgent,
  getDefaultEndpoint,
  clearMessagesCache,
  buildDefaultConvo,
  logger,
} from '~/utils';
import { useApplyModelSpecEffects } from '~/hooks/Agents';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const applyModelSpecEffects = useApplyModelSpecEffects();
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const clearAllLatestMessages = store.useClearLatestMessages(`useNavigateToConvo ${index}`);
  const { hasSetConversation, setConversation: setConvo } = store.useCreateConversationAtom(index);

  const setConversation = useCallback(
    (conversation: TConversation) => {
      setConvo(conversation);
      if (!conversation.spec) {
        return;
      }

      const startupConfig = queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]);
      applyModelSpecEffects({
        startupConfig,
        specName: conversation?.spec,
        convoId: conversation.conversationId,
      });
    },
    [setConvo, queryClient, applyModelSpecEffects],
  );

  const fetchFreshData = async (conversation?: Partial<TConversation>) => {
    const conversationId = conversation?.conversationId;
    if (!conversationId) {
      return;
    }
    try {
      const data = await queryClient.fetchQuery([QueryKeys.conversation, conversationId], () =>
        dataService.getConversationById(conversationId),
      );
      logger.log('conversation', 'Fetched fresh conversation data', data);

      const convoData = { ...data };
      clearModelForNonEphemeralAgent(convoData);
      setConversation(convoData);
      navigate(`/c/${conversationId ?? Constants.NEW_CONVO}`, { state: { focusChat: true } });
    } catch (error) {
      console.error('Error fetching conversation data on navigation', error);
      if (conversation) {
        setConversation(conversation as TConversation);
        navigate(`/c/${conversationId}`, { state: { focusChat: true } });
      }
    }
  };

  const navigateToConvo = (
    conversation?: TConversation | null,
    options?: {
      resetLatestMessage?: boolean;
      currentConvoId?: string;
    },
  ) => {
    if (!conversation) {
      logger.warn('conversation', 'Conversation not provided to `navigateToConvo`');
      return;
    }
    const { resetLatestMessage = true, currentConvoId } = options || {};
    logger.log('conversation', 'Navigating to conversation', conversation);
    hasSetConversation.current = true;
    setSubmission(null);
    if (resetLatestMessage) {
      logger.log('latest_message', 'Clearing all latest messages');
      clearAllLatestMessages();
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
    clearMessagesCache(queryClient, currentConvoId);
    if (convo.conversationId !== Constants.NEW_CONVO && convo.conversationId) {
      queryClient.invalidateQueries([QueryKeys.conversation, convo.conversationId]);
      fetchFreshData(convo);
    } else {
      setConversation(convo);
      navigate(`/c/${convo.conversationId ?? Constants.NEW_CONVO}`, { state: { focusChat: true } });
    }
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
