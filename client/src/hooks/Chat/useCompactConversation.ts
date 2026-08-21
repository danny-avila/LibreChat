import { useCallback } from 'react';
import { Constants } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { useCompactConversationMutation } from '~/data-provider';
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
 * The request carries the same agent-selection fields a normal message does,
 * so the route's shared `buildEndpointOption` middleware resolves the agent
 * the conversation actually runs on.
 */
export default function useCompactConversation() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getEphemeralAgent = useGetEphemeralAgent();
  const { conversation, latestMessageId, isSubmitting } = useChatContext();
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
    mutate(
      {
        conversationId,
        parentMessageId: latestMessageId,
        endpoint: conversation?.endpoint,
        endpointType: conversation?.endpointType,
        agent_id: conversation?.agent_id,
        model: conversation?.model,
        spec: conversation?.spec,
        /** Ephemeral agents derive their instructions from this, so it is
         *  re-sent to resolve the same agent the conversation runs on. */
        promptPrefix: conversation?.promptPrefix,
        ephemeralAgent: getEphemeralAgent(conversationId),
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
    conversationId,
    latestMessageId,
    hasConversation,
    getEphemeralAgent,
  ]);

  return { compact, canCompact, isCompacting: isLoading };
}
