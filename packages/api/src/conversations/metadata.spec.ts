import { updateConversationMetadata } from './metadata';

describe('updateConversationMetadata', () => {
  it('commits title and archive state in one scoped conversation write', async () => {
    const conversation = { conversationId: 'conversation-a', title: 'New title', isArchived: true };
    const saveConvo = jest.fn().mockResolvedValue(conversation);
    const updateConversationResourceTags = jest.fn();
    await expect(
      updateConversationMetadata(
        { saveConvo, updateConversationResourceTags },
        {
          userId: 'owner-a',
          tenantId: 'tenant-a',
          conversationId: 'conversation-a',
          title: ' New title ',
          isArchived: true,
        },
      ),
    ).resolves.toBe(conversation);
    expect(saveConvo).toHaveBeenCalledTimes(1);
    expect(saveConvo).toHaveBeenCalledWith(
      { userId: 'owner-a', interfaceConfig: undefined },
      { conversationId: 'conversation-a', title: 'New title', isArchived: true },
      expect.objectContaining({ noUpsert: true, tenantId: 'tenant-a', requireVisible: true }),
    );
    expect(updateConversationResourceTags).not.toHaveBeenCalled();
  });

  it('returns the tag operation committed snapshot without another conversation write', async () => {
    const conversation = { conversationId: 'conversation-a', tags: ['next'] };
    const saveConvo = jest.fn();
    const updateConversationResourceTags = jest.fn().mockResolvedValue(conversation);
    await expect(
      updateConversationMetadata(
        { saveConvo, updateConversationResourceTags },
        {
          userId: 'owner-a',
          conversationId: 'conversation-a',
          tags: ['next'],
        },
      ),
    ).resolves.toBe(conversation);
    expect(updateConversationResourceTags).toHaveBeenCalledWith(
      'owner-a',
      'conversation-a',
      ['next'],
      null,
    );
    expect(saveConvo).not.toHaveBeenCalled();
  });

  it.each([{ title: 'Changed' }, { isArchived: true }])(
    'rejects mixed tag changes before mutation: %j',
    async (fields) => {
      const saveConvo = jest.fn();
      const updateConversationResourceTags = jest.fn();
      await expect(
        updateConversationMetadata(
          { saveConvo, updateConversationResourceTags },
          {
            userId: 'owner-a',
            conversationId: 'conversation-a',
            tags: [],
            ...fields,
          },
        ),
      ).rejects.toThrow('Tag changes require a separate PATCH');
      expect(saveConvo).not.toHaveBeenCalled();
      expect(updateConversationResourceTags).not.toHaveBeenCalled();
    },
  );

  it('rejects a saveConvo error sentinel', async () => {
    const saveConvo = jest.fn().mockResolvedValue({ message: 'Error saving conversation' });
    await expect(
      updateConversationMetadata(
        { saveConvo, updateConversationResourceTags: jest.fn() },
        {
          userId: 'owner-a',
          conversationId: 'conversation-a',
          isArchived: true,
        },
      ),
    ).rejects.toThrow('Conversation metadata could not be saved');
  });
});
