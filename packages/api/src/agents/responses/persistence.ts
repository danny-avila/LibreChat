import { Constants } from 'librechat-data-provider';
import { isRetentionVisible } from '@librechat/data-schemas';
import type { IConversation, IMessage } from '@librechat/data-schemas';

export interface StoredResponseLookup {
  getConvo(userId: string, conversationId: string): Promise<IConversation | null>;
  getMessage(input: { user: string; messageId: string }): Promise<IMessage | null>;
}

export interface StoredResponseConversationLookup {
  getConvo(userId: string, conversationId: string): Promise<IConversation | null>;
}

export interface StoredResponseReference {
  conversation: IConversation;
  conversationId: string;
  responseMessage: IMessage | null;
}

export type StoredResponseResolution =
  | { status: 'found'; reference: StoredResponseReference }
  | { status: 'not_found' }
  | { status: 'read_only' };

const classifyConversation = (
  conversation: IConversation | null,
): 'found' | 'not_found' | 'read_only' => {
  if (conversation == null || !isRetentionVisible(conversation)) {
    return 'not_found';
  }
  return conversation.subagentThread == null ? 'found' : 'read_only';
};

export function isStoredResponseOutput(message: IMessage): boolean {
  return (
    message.isCreatedByUser !== true &&
    message.isUserSubmitted !== true &&
    message.metadata?.responsesInput == null
  );
}

export async function resolveStoredResponse(
  deps: StoredResponseLookup,
  userId: string,
  responseId: string,
): Promise<StoredResponseResolution> {
  if (!responseId.startsWith('resp_')) {
    const conversation = await deps.getConvo(userId, responseId);
    const status = classifyConversation(conversation);
    if (status === 'not_found') {
      return { status: 'not_found' };
    }
    if (status === 'read_only') {
      return { status: 'read_only' };
    }
    if (conversation == null) {
      return { status: 'not_found' };
    }
    return {
      status: 'found',
      reference: {
        conversation,
        conversationId: conversation.conversationId,
        responseMessage: null,
      },
    };
  }

  const responseMessage = await deps.getMessage({ user: userId, messageId: responseId });
  if (
    responseMessage == null ||
    responseMessage.isCreatedByUser !== false ||
    !isStoredResponseOutput(responseMessage) ||
    typeof responseMessage.conversationId !== 'string' ||
    !isRetentionVisible(responseMessage)
  ) {
    return { status: 'not_found' };
  }
  const conversation = await deps.getConvo(userId, responseMessage.conversationId);
  const status = classifyConversation(conversation);
  if (status === 'not_found') {
    return { status: 'not_found' };
  }
  if (status === 'read_only') {
    return { status: 'read_only' };
  }
  if (conversation == null) {
    return { status: 'not_found' };
  }
  return {
    status: 'found',
    reference: {
      conversation,
      conversationId: conversation.conversationId,
      responseMessage,
    },
  };
}

export async function revalidateStoredResponseConversation(
  deps: StoredResponseConversationLookup,
  userId: string,
  reference: StoredResponseReference,
): Promise<StoredResponseResolution> {
  const conversation = await deps.getConvo(userId, reference.conversationId);
  const status = classifyConversation(conversation);
  if (status === 'not_found' || conversation == null) {
    return { status: 'not_found' };
  }
  if (status === 'read_only') {
    return { status: 'read_only' };
  }
  return {
    status: 'found',
    reference: {
      conversation,
      conversationId: conversation.conversationId,
      responseMessage: reference.responseMessage,
    },
  };
}

export function selectStoredResponseHistory(
  messages: IMessage[],
  responseMessageId?: string,
): IMessage[] {
  if (responseMessageId == null) {
    return messages;
  }
  const targetIndex = messages.findIndex((message) => message.messageId === responseMessageId);
  if (targetIndex < 0) {
    return [];
  }
  const target = messages[targetIndex];
  const rootParent = (parentMessageId: string | null | undefined): boolean =>
    parentMessageId == null || parentMessageId === String(Constants.NO_PARENT);
  if (rootParent(target.parentMessageId)) {
    const legacyHistory = messages.slice(0, targetIndex + 1);
    return legacyHistory.every((message) => rootParent(message.parentMessageId))
      ? legacyHistory
      : [target];
  }

  const byId = new Map<string, IMessage>();
  for (const message of messages) {
    if (typeof message.messageId === 'string') {
      byId.set(message.messageId, message);
    }
  }
  const selected: IMessage[] = [];
  const seen = new Set<string>();
  let current: IMessage | undefined = target;
  while (current != null && typeof current.messageId === 'string' && !seen.has(current.messageId)) {
    selected.push(current);
    seen.add(current.messageId);
    const parentMessageId: string | null | undefined = current.parentMessageId;
    current =
      rootParent(parentMessageId) || typeof parentMessageId !== 'string'
        ? undefined
        : byId.get(parentMessageId);
  }
  if (
    current != null ||
    !rootParent(selected.length === 0 ? undefined : selected[selected.length - 1].parentMessageId)
  ) {
    return [];
  }
  return selected.reverse();
}
