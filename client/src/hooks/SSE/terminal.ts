import { Constants } from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import type { StreamStatusResponse } from '~/data-provider';
import type { RunEnd } from '~/store/families';
import type { DisconnectedRunRecovery } from './resumableRecovery';

export type RunRecoveryTarget = {
  userMessageId?: string;
  responseMessageId?: string;
};

export type PersistedRunState = {
  outcome?: RunEnd['outcome'];
  responseFound: boolean;
  userMessageFound: boolean;
};

export const TERMINAL_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] as const;
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

export const waitForRetryDelay = (delay: number, signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    function cleanup() {
      signal.removeEventListener('abort', onAbort);
    }
    function onAbort() {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, delay);

    signal.addEventListener('abort', onAbort, { once: true });
  });

export function isRetryableTerminalError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return true;
  }

  const candidate = error as {
    status?: number;
    response?: { status?: number };
  };
  const status = candidate.response?.status ?? candidate.status;
  return status == null || status === 408 || status === 429 || status >= 500;
}

export function getUnreconciledAssistantTail(
  messages: TMessage[] | undefined,
): TMessage | undefined {
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage || lastMessage.isCreatedByUser === true) {
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

function getMessageOutcome(message: TMessage): RunEnd['outcome'] | undefined {
  if (message.error === true) {
    return 'error';
  }
  if (message.unfinished === true) {
    return 'aborted';
  }
  if (
    message.createdAt == null ||
    message.updatedAt == null ||
    (message.messageId ?? '').endsWith('_')
  ) {
    return undefined;
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
