import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { Constants, EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { useCompactConversationMutation } from '~/data-provider';
import { isTemporaryConversation } from '~/utils';
import useUserKey from '~/hooks/Input/useUserKey';
import { NotificationSeverity } from '~/common';
import { useGetEphemeralAgent } from '~/store';
import useLocalize from '~/hooks/useLocalize';
import { useChatContext } from '~/Providers';

/**
 * The branch already ends at a summary boundary, so a second pass has nothing
 * left to fold in. Not a failure, so it is reported as information.
 */
const isNothingToCompact = (error: unknown): boolean =>
  (error as { response?: { data?: { code?: string } } } | undefined)?.response?.data?.code ===
  'NOTHING_TO_COMPACT';

/**
 * Manual context compaction: summarizes the active branch on demand and
 * persists the summary as the boundary every later turn starts from.
 *
 * The request carries the conversation's own fields, the same ones a normal
 * submission sends, so the route's shared `buildEndpointOption` middleware
 * resolves both the agent and the generation parameters the conversation runs
 * on rather than endpoint defaults.
 */
export default function useCompactConversation() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getEphemeralAgent = useGetEphemeralAgent();
  const { conversation, latestMessageId, isSubmitting } = useChatContext();
  const { getExpiry } = useUserKey(conversation?.endpoint ?? '');
  const { mutate, isLoading } = useCompactConversationMutation();

  const conversationId = conversation?.conversationId;
  const hasConversation =
    conversationId != null &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO;
  const canCompact = hasConversation && !isSubmitting && !isLoading;

  const compact = useCallback(() => {
    if (!hasConversation || isSubmitting || isLoading) {
      return;
    }
    /** Everything the endpoint's own schema defines, minus the transcript the
     *  server reads from the database anyway. */
    const { messages: _messages, ...conversationFields } = conversation ?? {};
    mutate(
      {
        ...conversationFields,
        conversationId,
        parentMessageId: latestMessageId,
        ephemeralAgent: getEphemeralAgent(conversationId),
        /** The user-key expiry marker `initializeOpenAI` / `initializeGoogle`
         *  read before loading a user-provided credential. Endpoint-aware, the
         *  same way `useChatFunctions` sets it for a normal submission. */
        key:
          conversation?.endpoint === EModelEndpoint.agents
            ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            : getExpiry(),
        /** Without this the summary is saved as a permanent message inside a
         *  temporary conversation and outlives every message it replaced. */
        isTemporary: isTemporaryConversation(conversation),
      },
      {
        onSuccess: () =>
          showToast({
            message: localize('com_ui_context_compacted'),
            severity: NotificationSeverity.SUCCESS,
          }),
        onError: (error) =>
          isNothingToCompact(error)
            ? showToast({
                message: localize('com_ui_context_compact_noop'),
                severity: NotificationSeverity.INFO,
              })
            : showToast({
                message: localize('com_ui_context_compact_failed'),
                severity: NotificationSeverity.ERROR,
              }),
      },
    );
  }, [
    mutate,
    isLoading,
    localize,
    showToast,
    conversation,
    isSubmitting,
    getExpiry,
    conversationId,
    latestMessageId,
    hasConversation,
    getEphemeralAgent,
  ]);

  return { compact, canCompact, isCompacting: isLoading };
}

/**
 * An Assistants thread lives on the provider, so an inserted summary would
 * compact nothing and the compaction route cannot resolve that provider at
 * all. Callers hide the action rather than let it fail every time.
 */
export const supportsCompaction = (endpoint?: string | null): boolean =>
  endpoint != null && endpoint !== '' && !isAssistantsEndpoint(endpoint);
