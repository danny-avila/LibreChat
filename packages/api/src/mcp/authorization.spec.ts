import { finalizeMCPAuthorizationMutation } from './authorization';

const scope = { userId: 'user-1', serverName: 'server-1' };

describe('finalizeMCPAuthorizationMutation', () => {
  it('publishes and disconnects after any write in a partial batch commits', async () => {
    const invalidateRecoveryGeneration = jest.fn().mockResolvedValue(undefined);
    const clearLocalRecovery = jest.fn();
    const disconnectUserConnection = jest.fn().mockResolvedValue(undefined);

    await expect(
      finalizeMCPAuthorizationMutation(
        { scope, mutationResults: [{ id: 'saved' }, new Error('later field failed')] },
        {
          invalidateRecoveryGeneration,
          clearLocalRecovery,
          disconnectUserConnection,
          retryDelaysMs: [0],
        },
      ),
    ).resolves.toBe(true);

    expect(invalidateRecoveryGeneration).toHaveBeenCalledWith(scope);
    expect(clearLocalRecovery).toHaveBeenCalledWith(scope.userId, scope.serverName);
    expect(disconnectUserConnection).toHaveBeenCalledWith(scope.userId, scope.serverName);
  });

  it('disconnects and completes teardown before surfacing a publication failure', async () => {
    const error = new Error('cache unavailable');
    const disconnectUserConnection = jest.fn().mockRejectedValue(new Error('disconnect failed'));
    const onDisconnectError = jest.fn();
    const afterDisconnect = jest.fn().mockResolvedValue(undefined);

    await expect(
      finalizeMCPAuthorizationMutation(
        { scope, mutationResults: [error], teardown: true },
        {
          invalidateRecoveryGeneration: jest.fn().mockRejectedValue(error),
          disconnectUserConnection,
          retryDelaysMs: [0],
          onDisconnectError,
          afterDisconnect,
        },
      ),
    ).rejects.toBe(error);

    expect(onDisconnectError).toHaveBeenCalledWith(expect.any(Error));
    expect(afterDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when every ordinary credential mutation failed', async () => {
    const invalidateRecoveryGeneration = jest.fn();
    const disconnectUserConnection = jest.fn();

    await expect(
      finalizeMCPAuthorizationMutation(
        { scope, mutationResults: [new Error('failed')] },
        { invalidateRecoveryGeneration, disconnectUserConnection },
      ),
    ).resolves.toBe(false);

    expect(invalidateRecoveryGeneration).not.toHaveBeenCalled();
    expect(disconnectUserConnection).not.toHaveBeenCalled();
  });
});
