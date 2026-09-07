import {
  CodeBridgeStatusError,
  createCodeBridgeStatusPoller,
  getCodeBridgeWorkerStatus,
} from './bridge';

describe('getCodeBridgeWorkerStatus', () => {
  test('normalizes a ready worker while exposing only bounded capability metadata', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
      ),
    );

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
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ protocolVersion: 1, workerId: 'personal-vm', ...invalid })),
      );

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

  test('rejects an upstream response before buffering more than 64 KiB', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ignored: 'x'.repeat(65 * 1024) })));

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

  test('coalesces matching polls and rejects excess distinct upstream concurrency', async () => {
    let release: ((response: Response) => void) | undefined;
    const fetchImpl = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const poll = createCodeBridgeStatusPoller({ fetchImpl, maxConcurrent: 1 });
    const params = {
      baseURL: 'https://code.example.com/v1',
      token: 'administrator-token',
      workerId: 'personal-vm',
    };

    const first = poll(params);
    expect(poll(params)).toBe(first);
    await expect(poll({ ...params, workerId: 'second-vm' })).rejects.toEqual(
      expect.objectContaining<Partial<CodeBridgeStatusError>>({ reason: 'busy' }),
    );
    release?.(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          workerId: 'personal-vm',
          online: false,
          ready: false,
        }),
      ),
    );
    await expect(first).resolves.toEqual({ status: 'offline' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
