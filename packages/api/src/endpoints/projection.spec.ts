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

  it('returns null before tokenization when the conversation is too large', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const messages = Array.from({ length: 513 }, (_, index) => ({
      messageId: `message-${index}`,
      parentMessageId: index === 0 ? null : `message-${index - 1}`,
      isCreatedByUser: true,
      text: 'hello',
    }));

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages: jest.fn(async () => messages) },
      { ...baseParams, messageId: 'message-512' },
    );

    expect(result).toBeNull();
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

    const result = await resolveContextProjection(
      { userId: 'user-1', getMessages: jest.fn(async () => messages) },
      { ...baseParams, messageId: 'message-256' },
    );

    expect(result).toBeNull();
    expect(createTokenCounter).not.toHaveBeenCalled();
  });

  it('returns null before tokenization when the branch text is too large', async () => {
    const { createTokenCounter } = jest.requireMock('@librechat/agents');
    const result = await resolveContextProjection(
      {
        userId: 'user-1',
        getMessages: jest.fn(async () => [
          {
            messageId: 'message-1',
            parentMessageId: null,
            isCreatedByUser: true,
            text: 'x'.repeat(512 * 1024 + 1),
          },
        ]),
      },
      baseParams,
    );

    expect(result).toBeNull();
    expect(createTokenCounter).not.toHaveBeenCalled();
  });
});
