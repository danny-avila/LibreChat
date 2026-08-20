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
  isNotFoundError,
  logger,
} from '~/utils';
import { useApplyModelSpecEffects } from '~/hooks/Agents';
import { startupConfigKey } from '~/data-provider';
import store from '~/store';

/**
 * The conversation the newest click is heading to. Every sidebar row mounts
 * its own `useNavigateToConvo`, so a ref would be scoped to one row and could
 * not tell that a click on a DIFFERENT row superseded this one — the case
 * where a slow response for B lands after the user has already moved to C.
 * Deliberately plain module state: it is written and read synchronously and
 * nothing renders from it, so an atom would only add subscriptions.
 */
let latestNavigationId: string | null = null;

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

  const applyConversation = (conversation: TConversation) => {
    const target = { ...conversation };
    clearModelForNonEphemeralAgent(target);
    setConversation(target);
    requestChatFocus();
  };

  const fetchConversationRecord = (conversationId: string) =>
    queryClient.fetchQuery([QueryKeys.conversation, conversationId], () =>
      dataService.getConversationById(conversationId),
    );

  /**
   * Reconciles the conversation record AFTER the route has already changed,
   * for a conversation whose full record was already cached. The cached record
   * carries everything the sidebar projection omits, so this only refreshes
   * server-side changes — awaiting it before navigating would spend a round
   * trip with the DEPARTING conversation still on screen.
   */
  const reconcileConversation = async (conversationId: string) => {
    try {
      const data = await fetchConversationRecord(conversationId);
      /** A later click may have moved on while this was in flight. Writing
       * here anyway would restore THIS conversation into state while the route
       * and transcript show the newer one, and sends read from state — so the
       * user could submit into a conversation they are no longer looking at. */
      if (latestNavigationId !== conversationId) {
        logger.log('conversation', 'Discarding superseded reconciliation', conversationId);
        return;
      }
      logger.log('conversation', 'Fetched fresh conversation data', data);
      applyConversation(data);
    } catch (error) {
      logger.error('conversation', 'Error fetching conversation data on navigation', error);
      /** Only a conversation that is confirmed GONE invalidates what is on
       * screen. The messages query is already mounted by now, so dropping its
       * cache on a transient failure would cancel an in-flight history fetch
       * (or discard one that already succeeded) with no route change left to
       * remount it, blanking a transcript that was fine. */
      if (latestNavigationId === conversationId && isNotFoundError(error)) {
        queryClient.removeQueries([QueryKeys.messages, conversationId]);
      }
    }
  };

  /**
   * First visit to a conversation in this session: nothing has its full record
   * yet, and the sidebar row is a PROJECTION (see `getConvosByCursor`) without
   * prompt prefix, sampling params, tools or files. Landing the route on that
   * would expose a usable composer whose sends silently carry default
   * settings, so this path keeps the pre-existing behavior and moves the route
   * once the real record is in hand. Every later switch to this conversation
   * takes the instant path above.
   */
  const navigateWithRecord = async (conversation: TConversation) => {
    const conversationId = conversation.conversationId;
    if (!conversationId) {
      return;
    }
    let record = conversation;
    try {
      record = await fetchConversationRecord(conversationId);
      logger.log('conversation', 'Fetched fresh conversation data', record);
    } catch (error) {
      logger.error('conversation', 'Error fetching conversation data on navigation', error);
      /** Nothing is mounted for this conversation yet, so clearing a warm
       * cache here still predates the route change: the target mounts a fresh
       * query rather than rendering contents that may no longer exist. */
      queryClient.removeQueries([QueryKeys.messages, conversationId]);
    }
    if (latestNavigationId !== conversationId) {
      logger.log('conversation', 'Discarding superseded navigation', conversationId);
      return;
    }
    applyConversation(record);
    navigate(`/c/${conversationId}`);
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
    /** Claim the newest navigation before any await, so a response still in
     * flight for the conversation being left cannot write over this one. */
    latestNavigationId = conversation.conversationId ?? null;
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
      const cachedConvo = queryClient.getQueryData<TConversation>([
        QueryKeys.conversation,
        convo.conversationId,
      ]);
      queryClient.invalidateQueries([QueryKeys.conversation, convo.conversationId]);
      if (!cachedConvo) {
        navigateWithRecord(convo);
        return;
      }
      /** Route and conversation state change together, in the click's own
       * task, so the switch commits once instead of straddling a round trip.
       * The cached record underlays the row, which is a list PROJECTION: the
       * row's fields are the fresher ones, everything the projection drops
       * (prompt prefix, sampling params, files) survives, and a send during
       * the reconcile window still carries this conversation's real settings. */
      applyConversation({ ...cachedConvo, ...convo });
      navigate(`/c/${convo.conversationId}`);
      reconcileConversation(convo.conversationId);
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
