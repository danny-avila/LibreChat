import {
  completeMCPAuthorizationWithTokenWaiters,
  finalizeMCPAuthorizationMutation,
} from './authorization';

const scope = { userId: 'user-1', serverName: 'server-1' };

describe('completeMCPAuthorizationWithTokenWaiters', () => {
  it('removes stale results and wakes pending waiters only after guarded completion', async () => {
    const tokens = { access_token: 'fresh' };
    const completeAuthorization = jest.fn().mockResolvedValue(undefined);
    const flowManager = {
      getFlowState: jest.fn(async (flowId: string) =>
        flowId === 'pending'
          ? { type: 'mcp_get_tokens', status: 'PENDING' }
          : { type: 'mcp_get_tokens', status: 'COMPLETED' },
      ),
      deleteFlow: jest.fn().mockResolvedValue(undefined),
      completeFlow: jest.fn().mockResolvedValue(undefined),
    };

    await completeMCPAuthorizationWithTokenWaiters(
      { flowIds: ['pending', 'stale', 'pending'], tokens, completeAuthorization },
      { flowManager },
    );

    expect(flowManager.deleteFlow).toHaveBeenCalledWith('stale', 'mcp_get_tokens');
    expect(flowManager.completeFlow).toHaveBeenCalledWith('pending', 'mcp_get_tokens', tokens);
    expect(completeAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      flowManager.completeFlow.mock.invocationCallOrder[0],
    );
  });

  it('does not expose tokens when guarded authorization completion fails', async () => {
    const error = new Error('cancelled');
    const flowManager = {
      getFlowState: jest.fn().mockResolvedValue({ type: 'mcp_get_tokens', status: 'PENDING' }),
      deleteFlow: jest.fn(),
      completeFlow: jest.fn(),
    };

    await expect(
      completeMCPAuthorizationWithTokenWaiters(
        {
          flowIds: ['pending'],
          tokens: { access_token: 'rolled-back' },
          completeAuthorization: jest.fn().mockRejectedValue(error),
        },
        { flowManager },
      ),
    ).rejects.toBe(error);

    expect(flowManager.completeFlow).not.toHaveBeenCalled();
  });
});

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
