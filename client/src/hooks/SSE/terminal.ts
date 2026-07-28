import { Constants } from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import type { DisconnectedRunRecovery } from './resumableRecovery';
import type { StreamStatusResponse } from '~/data-provider';
import type { RunEnd } from '~/store/families';
import { hasStreamStartFailed } from '~/utils/messages';

export type RunRecoveryTarget = {
  userMessageId?: string;
  responseMessageId?: string;
};

export type PersistedRunState = {
  outcome?: RunEnd['outcome'];
  responseFound: boolean;
  userMessageFound: boolean;
};

export const newConversationPath = `/c/${Constants.NEW_CONVO}`;

export function recoveryOwnsCurrentRoute(
  routerPathname: string | null,
  conversationId: string,
): boolean {
  const recoveryPath = `/c/${conversationId}`;
  if (routerPathname === recoveryPath) {
    return true;
  }

  return (
    routerPathname === newConversationPath &&
    typeof window !== 'undefined' &&
    window.location.pathname === recoveryPath
  );
}

export function withCurrentSearch(pathname: string): string {
  return typeof window === 'undefined' ? pathname : `${pathname}${window.location.search}`;
}

export function submissionBelongsToConversation(
  submission: TSubmission | null,
  conversationId: string,
): boolean {
  return (
    submission?.conversation?.conversationId === conversationId ||
    submission?.userMessage?.conversationId === conversationId ||
    submission?.initialResponse?.conversationId === conversationId
  );
}

export function getUnreconciledAssistantTail(
  messages: TMessage[] | undefined,
): TMessage | undefined {
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage || lastMessage.isCreatedByUser === true || hasStreamStartFailed(lastMessage)) {
    return undefined;
  }

  const messageId = lastMessage.messageId ?? '';
  const isUnreconciled =
    lastMessage.createdAt == null || lastMessage.updatedAt == null || messageId.endsWith('_');

  return isUnreconciled ? lastMessage : undefined;
}

export function getRunRecoveryTarget(
  disconnectedRun: DisconnectedRunRecovery | undefined,
  messages: TMessage[] | undefined,
): RunRecoveryTarget | undefined {
  const unreconciledResponse = getUnreconciledAssistantTail(messages);
  const userMessageId =
    disconnectedRun?.userMessageId ?? unreconciledResponse?.parentMessageId ?? undefined;
  const responseMessageId =
    disconnectedRun?.responseMessageId ?? unreconciledResponse?.messageId ?? undefined;

  if (!userMessageId && !responseMessageId) {
    return undefined;
  }

  return { userMessageId, responseMessageId };
}

export function getPriorRunRecoveryTarget(
  messages: TMessage[] | undefined,
  currentUserMessageId: string | undefined,
): RunRecoveryTarget | undefined {
  if (!messages?.length) {
    return undefined;
  }

  let priorMessages = messages;
  if (currentUserMessageId) {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (
        messages[index].isCreatedByUser === true &&
        messages[index].messageId === currentUserMessageId
      ) {
        priorMessages = messages.slice(0, index);
        break;
      }
    }
  }

  const priorResponse = getUnreconciledAssistantTail(priorMessages);
  if (!priorResponse) {
    return undefined;
  }

  return {
    userMessageId: priorResponse.parentMessageId ?? undefined,
    responseMessageId: priorResponse.messageId ?? undefined,
  };
}

export function preserveMessagesAfterRecoveryTarget(
  refreshedMessages: TMessage[],
  messagesBeforeRefresh: TMessage[] | undefined,
  target: RunRecoveryTarget | undefined,
): TMessage[] {
  if (!messagesBeforeRefresh?.length || !target) {
    return refreshedMessages;
  }

  const responseMessageId = target.responseMessageId;
  const unpaddedResponseMessageId = responseMessageId?.replace(/_+$/, '');
  let responseIndex = -1;

  if (responseMessageId) {
    responseIndex = messagesBeforeRefresh.findIndex(
      (message) =>
        message.isCreatedByUser !== true &&
        (message.messageId === responseMessageId ||
          (!!unpaddedResponseMessageId && message.messageId === unpaddedResponseMessageId)),
    );
  }

  if (responseIndex === -1 && target.userMessageId) {
    for (let index = messagesBeforeRefresh.length - 1; index >= 0; index--) {
      const message = messagesBeforeRefresh[index];
      if (message.isCreatedByUser !== true && message.parentMessageId === target.userMessageId) {
        responseIndex = index;
        break;
      }
    }
  }

  if (responseIndex === -1 || responseIndex === messagesBeforeRefresh.length - 1) {
    return refreshedMessages;
  }

  const refreshedMessageIds = new Set(
    refreshedMessages
      .map((message) => message.messageId)
      .filter((messageId): messageId is string => !!messageId),
  );
  const localSuffix = messagesBeforeRefresh
    .slice(responseIndex + 1)
    .filter((message) => !message.messageId || !refreshedMessageIds.has(message.messageId));

  return localSuffix.length > 0 ? [...refreshedMessages, ...localSuffix] : refreshedMessages;
}

function getMessageOutcome(message: TMessage): RunEnd['outcome'] | undefined {
  if (
    message.createdAt == null ||
    message.updatedAt == null ||
    (message.messageId ?? '').endsWith('_')
  ) {
    return undefined;
  }
  if (message.error === true) {
    return 'error';
  }
  if (message.unfinished === true) {
    return 'aborted';
  }
  return 'completed';
}

export function getPersistedRunState(
  messages: TMessage[] | undefined,
  target: RunRecoveryTarget | undefined,
): PersistedRunState {
  if (!messages?.length || !target) {
    return { responseFound: false, userMessageFound: false };
  }

  const responseMessageId = target.responseMessageId;
  const unpaddedResponseMessageId = responseMessageId?.replace(/_+$/, '');
  const canUseParentFallback = !responseMessageId || responseMessageId.endsWith('_');
  let fallbackResponse: TMessage | undefined;
  let userMessageFound = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      target.userMessageId &&
      message.isCreatedByUser === true &&
      message.messageId === target.userMessageId
    ) {
      userMessageFound = true;
      continue;
    }
    if (message.isCreatedByUser === true) {
      continue;
    }
    if (
      responseMessageId &&
      (message.messageId === responseMessageId ||
        (!!unpaddedResponseMessageId && message.messageId === unpaddedResponseMessageId))
    ) {
      return {
        outcome: getMessageOutcome(message),
        responseFound: true,
        userMessageFound,
      };
    }
    if (
      !fallbackResponse &&
      canUseParentFallback &&
      target.userMessageId &&
      message.parentMessageId === target.userMessageId
    ) {
      fallbackResponse = message;
    }
  }

  return {
    outcome: fallbackResponse ? getMessageOutcome(fallbackResponse) : undefined,
    responseFound: fallbackResponse != null,
    userMessageFound,
  };
}

export function getStatusRunOutcome(status: StreamStatusResponse): RunEnd['outcome'] | undefined {
  if (status.status === 'complete') {
    return 'completed';
  }
  if (status.status === 'error') {
    return 'error';
  }
  if (status.status === 'aborted') {
    return 'aborted';
  }
  return undefined;
}
