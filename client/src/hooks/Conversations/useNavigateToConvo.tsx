import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  Constants,
  dataService,
  getEndpointField,
  getDefaultParamsEndpoint,
} from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TStartupConfig,
  TModelsConfig,
  TConversation,
  TMessage,
} from 'librechat-data-provider';
import {
  clearModelForNonEphemeralAgent,
  getDefaultEndpoint,
  buildDefaultConvo,
  requestChatFocus,
  logger,
} from '~/utils';
import { useApplyModelSpecEffects } from '~/hooks/Agents';
import { startupConfigKey } from '~/data-provider';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const applyModelSpecEffects = useApplyModelSpecEffects();
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const { hasSetConversation, setConversation: setConvo } = store.useSetConversationAtom(index);

  const setConversation = useCallback(
    (conversation: TConversation) => {
      setConvo(conversation);
      if (!conversation.spec) {
        return;
      }

      const startupConfig = queryClient.getQueryData<TStartupConfig>(startupConfigKey(true));
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
      requestChatFocus();
      navigate(`/c/${conversationId ?? Constants.NEW_CONVO}`);
    } catch (error) {
      console.error('Error fetching conversation data on navigation', error);
      if (conversation) {
        /** The conversation fetch failed (deleted convo, lost access): drop the
         * warm message cache so stale contents can't render as current when the
         * background revalidation fails too. */
        queryClient.removeQueries([QueryKeys.messages, conversationId]);
        setConversation(conversation as TConversation);
        requestChatFocus();
        navigate(`/c/${conversationId}`);
      }
    }
  };

  const navigateToConvo = (
    conversation?: TConversation | null,
    options?: {
      currentConvoId?: string;
    },
  ) => {
    if (!conversation) {
      logger.warn('conversation', 'Conversation not provided to `navigateToConvo`');
      return;
    }
    const { currentConvoId } = options || {};
    logger.log('conversation', 'Navigating to conversation', conversation);
    hasSetConversation.current = true;
    setSubmission(null);

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

      const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, defaultEndpoint);
      convo = buildDefaultConvo({
        models,
        conversation,
        endpoint: defaultEndpoint,
        lastConversationSetup: conversation,
        defaultParamsEndpoint,
      });
    }
    clearAllConversations(true);
    /**
     * Invalidate (not remove) the departing conversation's messages so
     * switching back renders the warm cache instantly while a background
     * refetch reconciles; the NEW_CONVO cache still resets for immediate
     * optimistic messages. `refetchType: 'none'` because this observer is
     * still mounted mid-switch — the default would immediately refetch the
     * chat being LEFT; marking stale defers the fetch to the next mount.
     */
    if (currentConvoId != null && currentConvoId !== Constants.NEW_CONVO) {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.messages, currentConvoId],
        exact: true,
        refetchType: 'none',
      });
    }
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
    if (convo.conversationId !== Constants.NEW_CONVO && convo.conversationId) {
      /**
       * Invalidate the target's messages: ChatView's query mounts with
       * `refetchOnMount: true`, so a cached conversation renders immediately
       * and revalidates in the background instead of unmounting into a
       * spinner (the old removeQueries path), including when navigating in
       * from a non-chat route (e.g. /projects).
       */
      queryClient.invalidateQueries([QueryKeys.messages, convo.conversationId]);
      queryClient.invalidateQueries([QueryKeys.conversation, convo.conversationId]);
      fetchFreshData(convo);
    } else {
      setConversation(convo);
      requestChatFocus();
      navigate(`/c/${convo.conversationId ?? Constants.NEW_CONVO}`);
    }
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
