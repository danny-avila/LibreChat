import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants, ContentTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useChatContext } from '~/Providers';
import store from '~/store';

/** The leaf's content is a bare summary: the branch is already compacted up to here. */
export const isCompactionSummary = (message?: TMessage | null): boolean => {
  const content = message?.content;
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((part) => part?.type === ContentTypes.SUMMARY)
  );
};

/**
 * An Assistants thread lives on the provider, so a summary inserted into the
 * local history would compact nothing. Callers hide the action there.
 */
export const supportsCompaction = (endpoint?: string | null): boolean =>
  endpoint != null && endpoint !== '' && !isAssistantsEndpoint(endpoint);

/**
 * Manual context compaction. Submits a summarize-only turn hung off the
 * branch's leaf through the ordinary chat pipeline: the summary streams into
 * a response placeholder under the leaf, exactly like the automatic detour's,
 * and is persisted as the boundary every later turn starts from.
 */
export default function useCompactConversation() {
  const { ask, index, conversation, isSubmitting } = useChatContext();
  const latestMessage = useLatestMessage(index);
  const submission = useRecoilValue(store.submissionByIndex(index));

  const conversationId = conversation?.conversationId;
  const hasConversation =
    conversationId != null &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO;
  const isCompacting = isSubmitting && submission?.compact === true;
  const canCompact =
    hasConversation &&
    !isSubmitting &&
    latestMessage != null &&
    latestMessage.parentMessageId != null &&
    !isCompactionSummary(latestMessage);

  const compact = useCallback(() => {
    if (!canCompact || latestMessage == null) {
      return;
    }
    ask(
      {
        text: '',
        conversationId,
        messageId: latestMessage.messageId,
        parentMessageId: latestMessage.parentMessageId,
      },
      { compact: true },
    );
  }, [ask, canCompact, conversationId, latestMessage]);

  return { compact, canCompact, isCompacting };
}
