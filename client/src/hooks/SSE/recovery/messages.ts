import { QueryKeys } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { RunRecoveryTarget } from '../terminal';
import type { TerminalRetryStatus } from './retry';
import {
  getPersistedRunState,
  getUnreconciledAssistantTail,
  preserveMessagesAfterRecoveryTarget,
} from '../terminal';
import { runTerminalRetry } from './retry';
import { fetchMessagesWithCacheProtection } from '~/data-provider/Messages/queries';
import { isNotFoundError } from '~/utils';

export type PersistedResponseRefresh = {
  messages: TMessage[] | undefined;
  succeeded: boolean;
  notFound: boolean;
  retryStatus: TerminalRetryStatus;
};

type RefreshPersistedResponseParams = {
  conversationId: string;
  getMessages: () => TMessage[] | undefined;
  pathname: () => string;
  queryClient: QueryClient;
  recoveryTarget?: RunRecoveryTarget;
  acceptMissingResponse?: boolean;
  signal: AbortSignal;
  canContinue?: () => boolean;
};

type RefreshAttempt = {
  messages: TMessage[];
  notFound: boolean;
};

function isReconciledAttempt(
  attempt: RefreshAttempt,
  recoveryTarget: RunRecoveryTarget | undefined,
  acceptMissingResponse: boolean,
): boolean {
  if (attempt.notFound) {
    return true;
  }
  if (!recoveryTarget) {
    return getUnreconciledAssistantTail(attempt.messages) == null;
  }

  const persistedRun = getPersistedRunState(attempt.messages, recoveryTarget);
  return (
    persistedRun.outcome != null ||
    (acceptMissingResponse && persistedRun.userMessageFound && !persistedRun.responseFound)
  );
}

export async function refreshPersistedResponse({
  conversationId,
  getMessages,
  pathname,
  queryClient,
  recoveryTarget,
  acceptMissingResponse = false,
  signal,
  canContinue,
}: RefreshPersistedResponseParams): Promise<PersistedResponseRefresh> {
  if (!recoveryTarget && getUnreconciledAssistantTail(getMessages()) == null) {
    return {
      messages: getMessages(),
      succeeded: true,
      notFound: false,
      retryStatus: 'succeeded',
    };
  }

  const result = await runTerminalRetry<RefreshAttempt>({
    signal,
    canContinue,
    operation: async () => {
      const messagesBeforeRefresh = getMessages();
      try {
        const persistedMessages = await fetchMessagesWithCacheProtection({
          id: conversationId,
          pathname: pathname(),
          queryClient,
          protectActiveStream: false,
        });
        const reconciledMessages = preserveMessagesAfterRecoveryTarget(
          persistedMessages,
          messagesBeforeRefresh,
          recoveryTarget,
        );
        if (!signal.aborted && (canContinue?.() ?? true)) {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversationId],
            reconciledMessages,
          );
        }
        return { messages: reconciledMessages, notFound: false };
      } catch (error) {
        if (isNotFoundError(error)) {
          return { messages: getMessages() ?? [], notFound: true };
        }
        throw error;
      }
    },
    isSuccess: (attempt) => isReconciledAttempt(attempt, recoveryTarget, acceptMissingResponse),
  });
  const value = result.value;

  return {
    messages: value?.messages ?? getMessages(),
    succeeded: result.status === 'succeeded' && value?.notFound !== true,
    notFound: value?.notFound === true,
    retryStatus: result.status,
  };
}
