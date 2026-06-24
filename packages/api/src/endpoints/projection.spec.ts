import { resolveContextProjection } from './projection';
import { QUOTE_MAX_COUNT } from '~/utils/quotes';

jest.mock('@librechat/agents', () => ({
  Providers: { OPENAI: 'openai' },
  createTokenCounter: jest.fn(async () => jest.fn(() => 1)),
  projectAgentContextUsage: jest.fn(() => ({ tokenCount: 1, maxContextTokens: 1000 })),
}));

const GRAPH_SELECT = 'messageId parentMessageId metadata.summaryUsedTokens';
const BODY_SELECT = 'messageId parentMessageId tokenCount isCreatedByUser text quotes';

function textStats(messageId: string, textBytes = 5) {
  return {
    messageId,
    textBytes,
    quoteCount: 0,
    quoteBytes: 0,
    quoteLineCount: 0,
    nonStringQuoteCount: 0,
  };
}

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
    const getMessageTextStats = jest.fn();

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages, getMessageTextStats },
      { ...baseParams, messageId: 'message-512' },
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', user: 'user-1' },
      GRAPH_SELECT,
      { limit: 513, sort: false },
    );
    expect(getMessageTextStats).not.toHaveBeenCalled();
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
    const getMessageTextStats = jest.fn();

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages, getMessageTextStats },
      { ...baseParams, messageId: 'message-256' },
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessageTextStats).not.toHaveBeenCalled();
    expect(createTokenCounter).not.toHaveBeenCalled();
  });

  it('returns null before loading bodies when the branch text is too large', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const getMessages = jest.fn(async () => [
      {
        messageId: 'message-1',
        parentMessageId: null,
      },
    ]);
    const getMessageTextStats = jest.fn(async () => [textStats('message-1', 512 * 1024 + 1)]);
    const result = await resolveContextProjection(
      {
        userId: 'user-1',
        getMessages,
        getMessageTextStats,
      },
      baseParams,
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessageTextStats).toHaveBeenCalledWith(
      {
        conversationId: 'conversation-1',
        user: 'user-1',
        messageId: { $in: ['message-1'] },
      },
      { limit: 1 },
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
      select === GRAPH_SELECT ? graph : bodies,
    );
    const getMessageTextStats = jest.fn(async () => [
      textStats('message-1', 5),
      textStats('message-2', 6),
    ]);

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages, getMessageTextStats },
      { ...baseParams, messageId: 'message-2' },
    );

    expect(result).toEqual({ tokenCount: 1, maxContextTokens: 1000 });
    expect(getMessages).toHaveBeenNthCalledWith(
      1,
      { conversationId: 'conversation-1', user: 'user-1' },
      GRAPH_SELECT,
      { limit: 513, sort: false },
    );
    expect(getMessageTextStats).toHaveBeenCalledWith(
      {
        conversationId: 'conversation-1',
        user: 'user-1',
        messageId: { $in: ['message-1', 'message-2'] },
      },
      { limit: 2 },
    );
    expect(getMessages).toHaveBeenNthCalledWith(
      2,
      {
        conversationId: 'conversation-1',
        user: 'user-1',
        messageId: { $in: ['message-1', 'message-2'] },
      },
      BODY_SELECT,
      { limit: 2, sort: false },
    );
  });

  it('returns null before loading bodies when a branch message has too many quotes', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const getMessages = jest.fn(async () => [
      {
        messageId: 'message-1',
        parentMessageId: null,
      },
    ]);
    const getMessageTextStats = jest.fn(async () => [
      {
        ...textStats('message-1'),
        quoteCount: QUOTE_MAX_COUNT + 1,
        quoteBytes: 10,
        quoteLineCount: QUOTE_MAX_COUNT + 1,
      },
    ]);

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages, getMessageTextStats },
      baseParams,
    );

    expect(result).toBeNull();
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessageTextStats).toHaveBeenCalledTimes(1);
    expect(createTokenCounter).not.toHaveBeenCalled();
  });
});
