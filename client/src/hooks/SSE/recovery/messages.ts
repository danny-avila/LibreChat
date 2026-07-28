import { QueryKeys } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { PendingRunReconciliation } from '../resumableRecovery';
import type { RunRecoveryTarget } from '../terminal';
import type { TerminalRetryStatus } from './retry';
import {
  getPersistedRunState,
  getUnreconciledAssistantTail,
  mergePersistedRunIntoMessages,
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

type PendingRefreshAttempt = RefreshAttempt & {
  reconciledTaskIds: string[];
};

export type PendingPersistedResponseRefresh = PersistedResponseRefresh & {
  reconciledTaskIds: string[];
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
    operation: async (attemptSignal) => {
      const messagesBeforeRefresh = getMessages();
      try {
        const persistedMessages = await fetchMessagesWithCacheProtection({
          id: conversationId,
          pathname: pathname(),
          queryClient,
          protectActiveStream: false,
          signal: attemptSignal,
        });
        const reconciledMessages = preserveMessagesAfterRecoveryTarget(
          persistedMessages,
          messagesBeforeRefresh,
          recoveryTarget,
        );
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
  const hasPersistedResponse =
    !recoveryTarget ||
    (value != null && getPersistedRunState(value.messages, recoveryTarget).responseFound);
  if (
    result.status === 'succeeded' &&
    value &&
    !value.notFound &&
    hasPersistedResponse &&
    !signal.aborted &&
    (canContinue?.() ?? true)
  ) {
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], value.messages);
  }

  return {
    messages: result.status === 'succeeded' ? (value?.messages ?? getMessages()) : getMessages(),
    succeeded: result.status === 'succeeded' && value?.notFound !== true,
    notFound: value?.notFound === true,
    retryStatus: result.status,
  };
}

export async function refreshPendingPersistedResponses({
  conversationId,
  getMessages,
  pathname,
  queryClient,
  tasks,
  signal,
  canContinue,
}: Omit<RefreshPersistedResponseParams, 'recoveryTarget' | 'acceptMissingResponse'> & {
  tasks: PendingRunReconciliation[];
}): Promise<PendingPersistedResponseRefresh> {
  const result = await runTerminalRetry<PendingRefreshAttempt>({
    signal,
    canContinue,
    operation: async (attemptSignal) => {
      try {
        const persistedMessages = await fetchMessagesWithCacheProtection({
          id: conversationId,
          pathname: pathname(),
          queryClient,
          protectActiveStream: false,
          signal: attemptSignal,
        });
        let mergedMessages = getMessages() ?? [];
        const reconciledTaskIds: string[] = [];

        for (const task of tasks) {
          const recoveryTarget = {
            userMessageId: task.userMessageId,
            responseMessageId: task.responseMessageId,
          };
          if (getPersistedRunState(persistedMessages, recoveryTarget).outcome == null) {
            continue;
          }
          mergedMessages = mergePersistedRunIntoMessages(
            mergedMessages,
            persistedMessages,
            recoveryTarget,
          );
          reconciledTaskIds.push(task.taskId);
        }

        return {
          messages: mergedMessages,
          notFound: false,
          reconciledTaskIds,
        };
      } catch (error) {
        if (isNotFoundError(error)) {
          return {
            messages: getMessages() ?? [],
            notFound: true,
            reconciledTaskIds: [],
          };
        }
        throw error;
      }
    },
    isSuccess: (attempt) => attempt.notFound || attempt.reconciledTaskIds.length > 0,
  });
  const value = result.value;
  if (
    result.status === 'succeeded' &&
    value &&
    !value.notFound &&
    !signal.aborted &&
    (canContinue?.() ?? true)
  ) {
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], value.messages);
  }

  return {
    messages: result.status === 'succeeded' ? (value?.messages ?? getMessages()) : getMessages(),
    succeeded: result.status === 'succeeded' && value?.notFound !== true,
    notFound: value?.notFound === true,
    reconciledTaskIds: value?.reconciledTaskIds ?? [],
    retryStatus: result.status,
  };
}
