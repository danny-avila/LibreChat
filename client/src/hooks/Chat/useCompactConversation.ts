import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { Constants, isAssistantsEndpoint } from 'librechat-data-provider';
import { useCompactConversationMutation } from '~/data-provider';
import { isTemporaryConversation } from '~/utils';
import { NotificationSeverity } from '~/common';
import store, { useGetEphemeralAgent } from '~/store';
import useLocalize from '~/hooks/useLocalize';
import { useChatContext } from '~/Providers';

/**
 * The branch already ends at a summary boundary, so a second pass has nothing
 * left to fold in. Not a failure, so it is reported as information.
 */
const errorCode = (error: unknown): string | undefined =>
  (error as { response?: { data?: { code?: string } } } | undefined)?.response?.data?.code;

/** Codes that describe the conversation rather than a failure to compact it. */
const TOAST_BY_CODE = {
  NOTHING_TO_COMPACT: {
    key: 'com_ui_context_compact_noop',
    severity: NotificationSeverity.INFO,
  },
  TRANSCRIPT_TOO_LARGE: {
    key: 'com_ui_context_compact_too_large',
    severity: NotificationSeverity.WARNING,
  },
  UNWORKABLE_CONTEXT: {
    key: 'com_ui_context_compact_unsupported_model',
    severity: NotificationSeverity.WARNING,
  },
} as const;

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
  const { conversation, latestMessageId, isSubmitting, index } = useChatContext();
  const setIsCompacting = useSetRecoilState(store.isCompactingFamily(index));
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
    /** Publishing the pending state is what keeps a submit during the call
     *  from racing the summary onto the same leaf. */
    setIsCompacting(true);
    mutate(
      {
        ...conversationFields,
        conversationId,
        parentMessageId: latestMessageId,
        ephemeralAgent: getEphemeralAgent(conversationId),
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
        onError: (error) => {
          const code = errorCode(error);
          if (code === 'CONTENT_FILTER_BLOCK') {
            /** The server's denial body is pre-sanitized and says what has to
             *  go, which a generic failure toast would not. */
            const message = (error as { response?: { data?: { message?: string } } } | undefined)
              ?.response?.data?.message;
            showToast({
              message: message ?? localize('com_ui_context_compact_failed'),
              severity: NotificationSeverity.WARNING,
            });
            return;
          }
          const known = TOAST_BY_CODE[(code ?? '') as keyof typeof TOAST_BY_CODE];
          showToast(
            known
              ? { message: localize(known.key), severity: known.severity }
              : {
                  message: localize('com_ui_context_compact_failed'),
                  severity: NotificationSeverity.ERROR,
                },
          );
        },
        onSettled: () => setIsCompacting(false),
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
    setIsCompacting,
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
