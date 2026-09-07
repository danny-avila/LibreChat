import { CodeBridgeStatusError, getCodeBridgeWorkerStatus } from './bridge';

describe('getCodeBridgeWorkerStatus', () => {
  test('normalizes a ready worker while exposing only bounded capability metadata', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        protocolVersion: 1,
        workerId: 'personal-vm',
        online: true,
        ready: true,
        leaseExpiresInMs: 45_000,
        capabilities: {
          statefulWorkspace: true,
          sandboxProfile: 'native-srt',
          runtimes: ['bash'],
          workspaceTools: { operations: ['read_file', 'execute_command'] },
          identityId: 'must-not-cross-the-boundary',
        },
        binding: { tenantId: 'tenant-1', principal: { type: 'user', id: 'user-1' } },
      }),
    });

    await expect(
      getCodeBridgeWorkerStatus({
        baseURL: 'https://code.example.com/v1/',
        token: 'administrator-token',
        workerId: 'personal-vm',
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: 'ready',
      leaseExpiresInMs: 45_000,
      sandboxProfile: 'native-srt',
      runtimes: ['bash'],
      operations: ['read_file', 'execute_command'],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.example.com/v1/bridge/workers/personal-vm/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer administrator-token' },
        redirect: 'error',
      }),
    );
  });

  test.each([
    { online: false, ready: true },
    { online: true, ready: false },
    { online: false, ready: false, leaseExpiresInMs: 5_000 },
    { online: true, ready: true, leaseExpiresInMs: 60_001 },
    {
      online: true,
      ready: true,
      capabilities: { sandboxProfile: 'native-srt', runtimes: Array(33).fill('bash') },
    },
  ])('rejects an invalid upstream status response: %p', async (invalid) => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        protocolVersion: 1,
        workerId: 'personal-vm',
        ...invalid,
      }),
    });

    await expect(
      getCodeBridgeWorkerStatus({
        baseURL: 'https://code.example.com/v1',
        token: 'administrator-token',
        workerId: 'personal-vm',
        fetchImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CodeBridgeStatusError>>({ reason: 'invalid' }),
    );
  });
});
