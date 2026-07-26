import { resolveConversationAnchor } from './conversation';

describe('resolveConversationAnchor', () => {
  const fallback = new Date('2026-07-24T12:00:00.000Z');

  it('anchors a new conversation without loading an existing one', async () => {
    const loadConversation = jest.fn();

    const result = await resolveConversationAnchor({
      isNewConversation: true,
      loadConversation,
      now: () => fallback,
    });

    expect(result).toEqual({
      createdAt: fallback.toISOString(),
      conversation: undefined,
    });
    expect(loadConversation).not.toHaveBeenCalled();
  });

  it('returns an existing conversation with a normalized creation time', async () => {
    const conversation = {
      conversationId: 'conversation-1',
      createdAt: new Date('2025-01-02T03:04:05.000Z'),
    };

    const result = await resolveConversationAnchor({
      isNewConversation: false,
      loadConversation: async () => conversation,
      now: () => fallback,
    });

    expect(result).toEqual({
      createdAt: '2025-01-02T03:04:05.000Z',
      conversation,
    });
  });

  it.each([null, undefined, 'not-a-date'])(
    'uses the fallback time for a missing or invalid creation time: %p',
    async (createdAt) => {
      const conversation = createdAt === undefined ? null : { createdAt };

      const result = await resolveConversationAnchor({
        isNewConversation: false,
        loadConversation: async () => conversation,
        now: () => fallback,
      });

      expect(result).toEqual({
        createdAt: fallback.toISOString(),
        conversation,
      });
    },
  );

  it('reports load failures and degrades to a fresh anchor', async () => {
    const onLoadError = jest.fn();
    const failure = new Error('conversation store unavailable');

    const result = await resolveConversationAnchor({
      isNewConversation: false,
      loadConversation: async () => {
        throw failure;
      },
      now: () => fallback,
      onLoadError,
    });

    expect(result).toEqual({
      createdAt: fallback.toISOString(),
      conversation: undefined,
    });
    expect(onLoadError).toHaveBeenCalledWith(failure);
  });
});
