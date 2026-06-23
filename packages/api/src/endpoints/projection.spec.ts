import { QUOTE_MAX_COUNT } from '~/utils/quotes';
import { resolveContextProjection } from './projection';

jest.mock('@librechat/agents', () => ({
  Providers: { OPENAI: 'openai' },
  createTokenCounter: jest.fn(async () => jest.fn(() => 1)),
  projectAgentContextUsage: jest.fn(() => ({ tokenCount: 1, maxContextTokens: 1000 })),
}));

describe('resolveContextProjection', () => {
  const baseParams = {
    conversationId: 'conversation-1',
    messageId: 'message-1',
    endpoint: 'openai',
    maxContextTokens: 1000,
    model: 'gpt-4o',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null before tokenization when the conversation is too large', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const messages = Array.from({ length: 513 }, (_, index) => ({
      messageId: `message-${index}`,
      parentMessageId: index === 0 ? null : `message-${index - 1}`,
      isCreatedByUser: true,
      text: 'hello',
    }));
    const getMessages = jest.fn(async () => messages);

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages },
      { ...baseParams, messageId: 'message-512' },
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', user: 'user-1' },
      'messageId parentMessageId metadata',
      { limit: 513, sort: false },
    );
    expect(createTokenCounter).not.toHaveBeenCalled();
  });

  it('returns null before tokenization when the branch is too long', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const messages = Array.from({ length: 257 }, (_, index) => ({
      messageId: `message-${index}`,
      parentMessageId: index === 0 ? null : `message-${index - 1}`,
      isCreatedByUser: true,
      text: 'hello',
    }));
    const getMessages = jest.fn(async () => messages);

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages },
      { ...baseParams, messageId: 'message-256' },
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(createTokenCounter).not.toHaveBeenCalled();
  });

  it('returns null before tokenization when the branch text is too large', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const getMessages = jest.fn(async () => [
      {
        messageId: 'message-1',
        parentMessageId: null,
        isCreatedByUser: true,
        text: 'x'.repeat(512 * 1024 + 1),
      },
    ]);
    const result = await resolveContextProjection(
      {
        userId: 'user-1',
        getMessages,
      },
      baseParams,
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(getMessages).toHaveBeenNthCalledWith(
      2,
      {
        conversationId: 'conversation-1',
        user: 'user-1',
        messageId: { $in: ['message-1'] },
      },
      'messageId parentMessageId tokenCount isCreatedByUser text quotes',
      { limit: 1, sort: false },
    );
    expect(createTokenCounter).not.toHaveBeenCalled();
  });

  it('loads only branch message bodies after resolving the graph', async () => {
    const graph = [
      { messageId: 'message-1', parentMessageId: null },
      { messageId: 'message-2', parentMessageId: 'message-1' },
      { messageId: 'off-branch', parentMessageId: null },
    ];
    const bodies = [
      {
        messageId: 'message-1',
        parentMessageId: null,
        isCreatedByUser: true,
        text: 'first',
        tokenCount: 5,
      },
      {
        messageId: 'message-2',
        parentMessageId: 'message-1',
        isCreatedByUser: false,
        text: 'second',
        tokenCount: 6,
      },
    ];
    const getMessages = jest.fn(async (_filter: object, select?: string) =>
      select === 'messageId parentMessageId metadata' ? graph : bodies,
    );

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages },
      { ...baseParams, messageId: 'message-2' },
    );

    expect(result).toEqual({ tokenCount: 1, maxContextTokens: 1000 });
    expect(getMessages).toHaveBeenNthCalledWith(
      1,
      { conversationId: 'conversation-1', user: 'user-1' },
      'messageId parentMessageId metadata',
      { limit: 513, sort: false },
    );
    expect(getMessages).toHaveBeenNthCalledWith(
      2,
      {
        conversationId: 'conversation-1',
        user: 'user-1',
        messageId: { $in: ['message-1', 'message-2'] },
      },
      'messageId parentMessageId tokenCount isCreatedByUser text quotes',
      { limit: 2, sort: false },
    );
  });

  it('returns null before tokenization when a branch message has too many quotes', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const getMessages = jest.fn(async () => [
      {
        messageId: 'message-1',
        parentMessageId: null,
        isCreatedByUser: true,
        text: 'hello',
        quotes: Array.from({ length: QUOTE_MAX_COUNT + 1 }, (_, index) => `quote-${index}`),
      },
    ]);

    const result = await resolveContextProjection({ userId: 'user-1', getMessages }, baseParams);

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(createTokenCounter).not.toHaveBeenCalled();
  });
});
