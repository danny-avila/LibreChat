import { Constants } from 'librechat-data-provider';
import type { EventSubmission, TMessage } from 'librechat-data-provider';
import {
  buildCreatedInitialResponse,
  getExistingConversationAbortMessages,
  isInitialNewConversationSubmission,
  mergeErrorMessages,
  mergeRegenerateFinalMessages,
  startedAsNewConversation,
} from '~/hooks/SSE/useEventHandlers';

describe('buildCreatedInitialResponse', () => {
  const userMessage = {
    messageId: 'server-user-message',
    conversationId: 'conversation-1',
    isCreatedByUser: true,
    text: 'Hello',
    sender: 'User',
  } as TMessage;

  const initialResponse = {
    messageId: 'prelim-response',
    parentMessageId: 'original-user-message',
    conversationId: 'conversation-1',
    isCreatedByUser: false,
    text: '',
    sender: 'Assistant',
  } as TMessage;

  it('uses the created user message id for new turns', () => {
    expect(
      buildCreatedInitialResponse({
        initialResponse,
        userMessage,
        isRegenerate: false,
      }),
    ).toEqual(
      expect.objectContaining({
        messageId: 'server-user-message_',
        parentMessageId: 'server-user-message',
      }),
    );
  });

  it('preserves the regenerated prelim response id and parent', () => {
    expect(
      buildCreatedInitialResponse({
        initialResponse,
        userMessage,
        isRegenerate: true,
      }),
    ).toEqual(
      expect.objectContaining({
        messageId: 'prelim-response',
        parentMessageId: 'original-user-message',
      }),
    );
  });
});

describe('isInitialNewConversationSubmission', () => {
  it('treats a root user message as an optimistic new chat', () => {
    expect(
      isInitialNewConversationSubmission({
        userMessage: {
          messageId: 'user-1',
          parentMessageId: Constants.NO_PARENT,
        } as TMessage,
      } as EventSubmission),
    ).toBe(true);
  });

  it('does not treat follow-up turns as optimistic new chats', () => {
    expect(
      isInitialNewConversationSubmission({
        userMessage: {
          messageId: 'user-2',
          parentMessageId: 'assistant-1',
        } as TMessage,
      } as EventSubmission),
    ).toBe(false);
  });
});

describe('startedAsNewConversation', () => {
  const rootUserMessage = {
    messageId: 'user-1',
    parentMessageId: Constants.NO_PARENT,
  } as TMessage;

  it('treats an unsaved conversation as a new chat', () => {
    for (const conversationId of [undefined, Constants.NEW_CONVO, Constants.PENDING_CONVO]) {
      expect(
        startedAsNewConversation({
          conversation: { conversationId },
          userMessage: rootUserMessage,
        } as EventSubmission),
      ).toBe(true);
    }
  });

  it('treats a first turn without a saved id as a new chat', () => {
    expect(
      startedAsNewConversation({
        conversation: {},
        userMessage: rootUserMessage,
      } as EventSubmission),
    ).toBe(true);
  });

  it('does not treat a regenerated first reply of a saved conversation as a new chat', () => {
    expect(
      startedAsNewConversation({
        conversation: { conversationId: 'conversation-1' },
        userMessage: rootUserMessage,
        isRegenerate: true,
      } as EventSubmission),
    ).toBe(false);
  });

  it('does not treat a resubmitted first message of a saved conversation as a new chat', () => {
    expect(
      startedAsNewConversation({
        conversation: { conversationId: 'conversation-1' },
        userMessage: rootUserMessage,
        isEdited: true,
      } as EventSubmission),
    ).toBe(false);
  });

  it('does not treat a follow-up turn of a saved conversation as a new chat', () => {
    expect(
      startedAsNewConversation({
        conversation: { conversationId: 'conversation-1' },
        userMessage: { messageId: 'user-2', parentMessageId: 'assistant-1' } as TMessage,
      } as EventSubmission),
    ).toBe(false);
  });
});

describe('mergeRegenerateFinalMessages', () => {
  const userMessage = (messageId: string, parentMessageId: string = Constants.NO_PARENT) =>
    ({
      messageId,
      parentMessageId,
      conversationId: 'conversation-1',
      isCreatedByUser: true,
      sender: 'User',
      text: messageId,
    }) as TMessage;

  const assistantMessage = (messageId: string, parentMessageId: string) =>
    ({
      messageId,
      parentMessageId,
      conversationId: 'conversation-1',
      isCreatedByUser: false,
      sender: 'Assistant',
      text: messageId,
    }) as TMessage;

  it('keeps the original branch siblings when a non-tail regenerate finalizes', () => {
    const rootUser = userMessage('user-1');
    const originalResponse = assistantMessage('assistant-1', rootUser.messageId);
    const followUpUser = userMessage('user-2', originalResponse.messageId);
    const followUpResponse = assistantMessage('assistant-2', followUpUser.messageId);
    const finalResponse = assistantMessage('assistant-3', rootUser.messageId);

    expect(
      mergeRegenerateFinalMessages({
        messages: [rootUser, originalResponse, followUpUser, followUpResponse],
        responseMessage: finalResponse,
        initialResponseId: 'assistant-1_',
      }).map((message) => message.messageId),
    ).toEqual([
      rootUser.messageId,
      originalResponse.messageId,
      followUpUser.messageId,
      followUpResponse.messageId,
      finalResponse.messageId,
    ]);
  });

  it('replaces the streamed preliminary response when it is present', () => {
    const rootUser = userMessage('user-1');
    const preliminaryResponse = assistantMessage('assistant-1_', rootUser.messageId);
    const finalResponse = assistantMessage('assistant-3', rootUser.messageId);

    expect(
      mergeRegenerateFinalMessages({
        messages: [rootUser, preliminaryResponse],
        responseMessage: finalResponse,
        initialResponseId: preliminaryResponse.messageId,
      }).map((message) => message.messageId),
    ).toEqual([rootUser.messageId, finalResponse.messageId]);
  });
});

describe('getExistingConversationAbortMessages', () => {
  const message = (messageId: string) =>
    ({
      messageId,
      conversationId: 'conversation-1',
      text: messageId,
    }) as TMessage;

  it('restores the full pre-regenerate branch on early abort', () => {
    const originalMessages = [message('user-1'), message('assistant-1'), message('user-2')];
    const scopedRegenerateMessages = [message('user-1')];
    const currentStreamMessages = [message('user-1'), message('assistant-1_')];

    expect(
      getExistingConversationAbortMessages({
        messages: scopedRegenerateMessages,
        currentMessages: currentStreamMessages,
        regenerateMessages: originalMessages,
        isRegenerate: true,
      }).map(({ messageId }) => messageId),
    ).toEqual(['user-1', 'assistant-1', 'user-2']);
  });

  it('keeps the existing non-regenerate abort rollback behavior', () => {
    const submissionMessages = [message('user-1')];
    const currentMessages = [message('user-1'), message('assistant-1')];

    expect(
      getExistingConversationAbortMessages({
        messages: submissionMessages,
        currentMessages,
      }).map(({ messageId }) => messageId),
    ).toEqual(['user-1']);
  });
});

describe('mergeErrorMessages', () => {
  const message = (messageId: string, isCreatedByUser = false) =>
    ({
      messageId,
      conversationId: 'conversation-1',
      isCreatedByUser,
      text: messageId,
    }) as TMessage;

  it('adds the request and error for a normal submission', () => {
    const userMessage = message('user-1', true);
    const errorMessage = message('assistant-error');

    expect(
      mergeErrorMessages({
        messages: [message('previous-response')],
        userMessage,
        errorMessage,
      }).map(({ messageId }) => messageId),
    ).toEqual(['previous-response', 'user-1', 'assistant-error']);
  });

  it('preserves regeneration history without duplicating its user', () => {
    const userMessage = message('user-1', true);
    const originalResponse = message('assistant-1');
    const laterUser = message('user-2', true);
    const laterResponse = message('assistant-2');
    const errorMessage = message('assistant-1_');

    expect(
      mergeErrorMessages({
        messages: [userMessage],
        regenerateMessages: [userMessage, originalResponse, laterUser, laterResponse],
        userMessage,
        errorMessage,
        isRegenerate: true,
      }).map(({ messageId }) => messageId),
    ).toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2', 'assistant-1_']);
  });

  it('replaces an edited response error that intentionally reuses its id', () => {
    const userMessage = message('user-1', true);
    const originalResponse = message('assistant-1');
    const errorMessage = { ...originalResponse, text: 'Regeneration failed', error: true };

    const merged = mergeErrorMessages({
      messages: [userMessage],
      regenerateMessages: [userMessage, originalResponse],
      userMessage,
      errorMessage,
      isRegenerate: true,
    });

    expect(merged.map(({ messageId }) => messageId)).toEqual(['user-1', 'assistant-1']);
    expect(merged[1]).toEqual(errorMessage);
  });
});
