import {
  completeMCPAuthorizationWithTokenWaiters,
  finalizeMCPAuthorizationMutation,
  persistMCPAuthorizationTransaction,
} from './authorization';

const scope = { userId: 'user-1', serverName: 'server-1' };

describe('completeMCPAuthorizationWithTokenWaiters', () => {
  it('removes stale results and wakes pending waiters only after guarded completion', async () => {
    const tokens = { access_token: 'fresh' };
    const completeAuthorization = jest.fn().mockResolvedValue(undefined);
    const flowManager = {
      getFlowState: jest.fn(async (flowId: string) =>
        flowId === 'pending'
          ? { type: 'mcp_get_tokens', status: 'PENDING', createdAt: 123, metadata: {} }
          : { type: 'mcp_get_tokens', status: 'COMPLETED' },
      ),
      deleteFlow: jest.fn().mockResolvedValue(undefined),
      settleFlowIfCurrent: jest.fn().mockResolvedValue('updated'),
    };

    await completeMCPAuthorizationWithTokenWaiters(
      { flowIds: ['pending', 'stale', 'pending'], tokens, completeAuthorization },
      { flowManager },
    );

    expect(flowManager.deleteFlow).toHaveBeenCalledWith('stale', 'mcp_get_tokens');
    expect(flowManager.settleFlowIfCurrent).toHaveBeenCalledWith(
      'pending',
      'mcp_get_tokens',
      123,
      '',
      tokens,
    );
    expect(completeAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      flowManager.settleFlowIfCurrent.mock.invocationCallOrder[0],
    );
  });

  it('does not expose tokens when guarded authorization completion fails', async () => {
    const error = new Error('cancelled');
    const flowManager = {
      getFlowState: jest
        .fn()
        .mockResolvedValue({ type: 'mcp_get_tokens', status: 'PENDING', createdAt: 123 }),
      deleteFlow: jest.fn(),
      settleFlowIfCurrent: jest.fn(),
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

    expect(flowManager.settleFlowIfCurrent).not.toHaveBeenCalled();
  });

  it('does not commit authorization when stale token-flow cleanup is unavailable', async () => {
    const error = new Error('flow store unavailable');
    const completeAuthorization = jest.fn();
    const onTokenFlowError = jest.fn();
    const flowManager = {
      getFlowState: jest.fn().mockRejectedValue(error),
      deleteFlow: jest.fn(),
      settleFlowIfCurrent: jest.fn(),
    };

    await expect(
      completeMCPAuthorizationWithTokenWaiters(
        { flowIds: ['token-flow'], tokens: { access_token: 'fresh' }, completeAuthorization },
        { flowManager, onTokenFlowError },
      ),
    ).rejects.toBe(error);

    expect(onTokenFlowError).toHaveBeenCalledWith('prepare', error);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });
});

describe('persistMCPAuthorizationTransaction', () => {
  it('keeps validation, publication, OAuth settlement, and token-waiter settlement in one boundary', async () => {
    const tokens = { access_token: 'fresh' };
    const persistTokens = jest.fn(async (_tokens, onStoreCommitted) => {
      await onStoreCommitted(tokens);
      return tokens;
    });
    const completeAuthorization = jest.fn().mockResolvedValue(undefined);
    const invalidateRecoveryGeneration = jest.fn().mockResolvedValue(undefined);
    const ensureServerActive = jest.fn().mockResolvedValue(true);
    const flowManager = {
      getFlowState: jest.fn().mockResolvedValue(null),
      deleteFlow: jest.fn().mockResolvedValue(true),
      settleFlowIfCurrent: jest.fn(),
    };

    await expect(
      persistMCPAuthorizationTransaction(
        {
          scope,
          flowIds: ['token-flow'],
          tokens,
          completeAuthorization,
          persistTokens,
        },
        {
          ensureServerActive,
          inactiveServerError: () => new Error('deleted'),
          invalidateRecoveryGeneration,
          flowManager,
          retryDelaysMs: [0],
        },
      ),
    ).resolves.toBe(tokens);

    expect(ensureServerActive.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateRecoveryGeneration.mock.invocationCallOrder[0],
    );
    expect(invalidateRecoveryGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      completeAuthorization.mock.invocationCallOrder[0],
    );
  });
});

describe('finalizeMCPAuthorizationMutation', () => {
  it('publishes and disconnects after any write in a partial batch commits', async () => {
    const invalidateRecoveryGeneration = jest.fn().mockResolvedValue(undefined);
    const persistPublicationRetry = jest.fn();
    const clearPublicationRetry = jest.fn().mockResolvedValue(undefined);
    const clearLocalRecovery = jest.fn();
    const disconnectUserConnection = jest.fn().mockResolvedValue(undefined);

    await expect(
      finalizeMCPAuthorizationMutation(
        {
          scope,
          mutationResults: [{ id: 'saved' }, new Error('later field failed')],
          publicationRetryVersion: 'prepared-v1',
        },
        {
          invalidateRecoveryGeneration,
          persistPublicationRetry,
          clearPublicationRetry,
          clearLocalRecovery,
          disconnectUserConnection,
          retryDelaysMs: [0],
        },
      ),
    ).resolves.toBe(true);

    expect(invalidateRecoveryGeneration).toHaveBeenCalledWith(scope);
    expect(persistPublicationRetry).not.toHaveBeenCalled();
    expect(clearPublicationRetry).toHaveBeenCalledWith(scope, 'prepared-v1');
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
    const clearPublicationRetry = jest.fn().mockResolvedValue(undefined);

    await expect(
      finalizeMCPAuthorizationMutation(
        {
          scope,
          mutationResults: [new Error('failed')],
          publicationRetryVersion: 'prepared-v1',
        },
        { invalidateRecoveryGeneration, disconnectUserConnection, clearPublicationRetry },
      ),
    ).resolves.toBe(false);

    expect(invalidateRecoveryGeneration).not.toHaveBeenCalled();
    expect(disconnectUserConnection).not.toHaveBeenCalled();
    expect(clearPublicationRetry).toHaveBeenCalledWith(scope, 'prepared-v1');
  });
});
