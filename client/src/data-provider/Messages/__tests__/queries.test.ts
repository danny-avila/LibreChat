import type { TMessage } from 'librechat-data-provider';
import { getStableMessages } from '../queries';

const message = (overrides: Partial<TMessage>): TMessage =>
  ({
    messageId: 'message-id',
    conversationId: 'convo-id',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    text: '',
    sender: 'User',
    isCreatedByUser: true,
    createdAt: '2026-05-21T12:00:00.000Z',
    updatedAt: '2026-05-21T12:00:00.000Z',
    ...overrides,
  }) as TMessage;

describe('getStableMessages', () => {
  it('keeps cache when an empty result races with unhydrated stream messages', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({ messageId: 'user-2', createdAt: undefined, updatedAt: undefined }),
      message({
        messageId: 'user-2_',
        parentMessageId: 'user-2',
        isCreatedByUser: false,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    ];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: [],
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(currentMessages);
  });

  it('keeps cache when a prefix result races with a pending assistant tail', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({ messageId: 'user-2', createdAt: undefined, updatedAt: undefined }),
      message({
        messageId: 'user-2_',
        parentMessageId: 'user-2',
        isCreatedByUser: false,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    ];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: [currentMessages[0]],
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(currentMessages);
  });

  it('accepts a shorter result when the app is not streaming', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({
        messageId: 'user-2_',
        parentMessageId: 'user-2',
        isCreatedByUser: false,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    ];
    const serverMessages = [currentMessages[0]];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: serverMessages,
      currentMessages,
      isStreaming: false,
    });

    expect(result).toBe(serverMessages);
  });

  it('accepts a shorter result when an unhydrated message is not the assistant tail', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({ messageId: 'old-unhydrated', createdAt: undefined, updatedAt: undefined }),
      message({ messageId: 'persisted-3' }),
    ];
    const serverMessages = [currentMessages[0]];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: serverMessages,
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(serverMessages);
  });

  it('accepts a shorter result when the server result is not a prefix of cache', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({ messageId: 'persisted-2' }),
      message({
        messageId: 'persisted-2_',
        parentMessageId: 'persisted-2',
        isCreatedByUser: false,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    ];
    const serverMessages = [message({ messageId: 'different-1' })];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: serverMessages,
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(serverMessages);
  });

  it('accepts a shorter result when an unhydrated assistant tail has no parent turn', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({
        messageId: 'orphaned-response_',
        isCreatedByUser: false,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    ];
    const serverMessages = [currentMessages[0]];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: serverMessages,
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(serverMessages);
  });

  it('accepts fewer persisted messages when the cache is fully hydrated', () => {
    const currentMessages = [
      message({ messageId: 'persisted-1' }),
      message({ messageId: 'persisted-2' }),
      message({ messageId: 'persisted-3' }),
    ];
    const serverMessages = [currentMessages[0], currentMessages[1]];

    const result = getStableMessages({
      pathname: '/c/convo-id',
      result: serverMessages,
      currentMessages,
      isStreaming: true,
    });

    expect(result).toBe(serverMessages);
  });

  it('does not preserve cache on the new conversation route', () => {
    const currentMessages = [message({ messageId: 'user-1', createdAt: undefined })];

    const result = getStableMessages({
      pathname: '/c/new',
      result: [],
      currentMessages,
      isStreaming: true,
    });

    expect(result).toEqual([]);
  });
});
