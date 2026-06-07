import type { TMessage } from 'librechat-data-provider';
import {
  getRegenerateSubmissionMessages,
  getPreliminaryRegenerateResponseMessageId,
  getRegenerateTargetResponseMessage,
} from '../useChatFunctions';

const userMessage = (messageId: string, parentMessageId = '00000000-0000-0000-0000-000000000000') =>
  ({
    messageId,
    parentMessageId,
    isCreatedByUser: true,
    sender: 'User',
    text: messageId,
  }) as TMessage;

const assistantMessage = (messageId: string, parentMessageId: string) =>
  ({
    messageId,
    parentMessageId,
    isCreatedByUser: false,
    sender: 'Assistant',
    text: messageId,
  }) as TMessage;

describe('regenerate response targeting', () => {
  it('uses the clicked assistant response instead of the conversation tail', () => {
    const messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
      userMessage('user-3', 'assistant-2'),
      assistantMessage('assistant-3', 'user-3'),
    ];

    const targetResponse = getRegenerateTargetResponseMessage({
      messages,
      parentMessageId: 'user-1',
      targetResponseMessageId: 'assistant-1',
      latestMessage: messages[5],
    });

    expect(targetResponse?.messageId).toBe('assistant-1');
    expect(getPreliminaryRegenerateResponseMessageId(targetResponse?.messageId)).toBe(
      'assistant-1_',
    );
  });

  it('only falls back to latestMessage when it belongs to the regenerated user turn', () => {
    const messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
    ];

    expect(
      getRegenerateTargetResponseMessage({
        messages,
        parentMessageId: 'user-1',
        latestMessage: messages[3],
      })?.messageId,
    ).toBe('assistant-1');

    expect(
      getRegenerateTargetResponseMessage({
        messages,
        parentMessageId: 'user-2',
        latestMessage: messages[3],
      })?.messageId,
    ).toBe('assistant-2');
  });

  it('truncates regenerate history before the targeted assistant response', () => {
    const messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
      userMessage('user-3', 'assistant-2'),
      assistantMessage('assistant-3', 'user-3'),
    ];

    expect(
      getRegenerateSubmissionMessages({
        messages,
        targetResponseMessage: messages[1],
        initialResponseId: 'assistant-1_',
      }).map((message) => message.messageId),
    ).toEqual(['user-1']);
  });
});
