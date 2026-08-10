const { deleteUserData } = require('../delete-user-data');

function createModels(overrides = {}) {
  const names = [
    'Action',
    'Agent',
    'AgentApiKey',
    'Assistant',
    'Balance',
    'ConversationTag',
    'Conversation',
    'Message',
    'File',
    'Key',
    'MemoryEntry',
    'PluginAuth',
    'Prompt',
    'PromptGroup',
    'Preset',
    'Session',
    'SharedLink',
    'ToolCall',
    'Token',
    'AclEntry',
    'Transaction',
  ];
  const models = Object.fromEntries(
    names.map((name) => [name, { deleteMany: jest.fn().mockResolvedValue(undefined) }]),
  );
  models.Group = { updateMany: jest.fn().mockResolvedValue(undefined) };
  models.User = { deleteOne: jest.fn().mockResolvedValue(undefined) };
  return { ...models, ...overrides };
}

describe('deleteUserData', () => {
  it('does not enter the authority fence when unrelated cleanup fails', async () => {
    const unrelatedError = new Error('conversation cleanup failed');
    const models = createModels({
      Conversation: { deleteMany: jest.fn().mockRejectedValue(unrelatedError) },
    });
    const authorityConsistency = { mutateMCPAuthority: jest.fn() };

    await expect(
      deleteUserData({
        models,
        uid: 'user-1',
        userObjectId: 'object-user-1',
        deleteTransactions: false,
        authorityConsistency,
        invalidateAuthUserDoc: jest.fn(),
      }),
    ).rejects.toBe(unrelatedError);

    expect(authorityConsistency.mutateMCPAuthority).not.toHaveBeenCalled();
    expect(models.User.deleteOne).not.toHaveBeenCalled();
    expect(models.Agent.deleteMany).not.toHaveBeenCalled();
  });

  it('publishes authority mutations before invalidating the auth cache', async () => {
    const events = [];
    const models = createModels();
    const authorityConsistency = {
      mutateMCPAuthority: jest.fn(async (action) => {
        events.push('fence:start');
        await action();
        events.push('fence:published');
      }),
    };
    const invalidateAuthUserDoc = jest.fn(async () => {
      events.push('cache:invalidated');
    });

    await deleteUserData({
      models,
      uid: 'user-1',
      userObjectId: 'object-user-1',
      deleteTransactions: true,
      authorityConsistency,
      invalidateAuthUserDoc,
    });

    expect(events).toEqual(['fence:start', 'fence:published', 'cache:invalidated']);
    expect(models.Agent.deleteMany).toHaveBeenCalledWith({ author: 'user-1' });
    expect(models.PluginAuth.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(models.Token.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(models.AclEntry.deleteMany).toHaveBeenCalledWith({ principalId: 'object-user-1' });
    expect(models.Group.updateMany).toHaveBeenCalledWith(
      { memberIds: 'user-1' },
      { $pullAll: { memberIds: ['user-1'] } },
    );
    expect(models.User.deleteOne).toHaveBeenCalledWith({ _id: 'user-1' });
    expect(models.Transaction.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
    expect(invalidateAuthUserDoc).toHaveBeenCalledWith({ userId: 'user-1' });
  });
});
