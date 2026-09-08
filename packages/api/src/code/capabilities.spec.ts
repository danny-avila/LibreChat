import type { AppConfig } from '@librechat/data-schemas';
import type { CodeExecutionContext, CodeEnvironmentConfig } from '~/agents/execution';
import { supportsProgrammaticCodeExecution } from './capabilities';

const context: CodeExecutionContext = {
  baseUrl: 'https://bridge.example',
  codeSessionKey: 'session',
  executionProfile: 'stateful',
  statefulSessions: true,
  environmentId: 'personal',
  environmentType: 'attached',
  bridgeWorkerId: 'worker',
};
const environments: CodeEnvironmentConfig[] = [
  {
    id: 'personal',
    name: 'Personal',
    type: 'attached',
    owner: 'principal',
    baseURL: context.baseUrl,
    workerId: 'worker',
    controlPlaneId: 'control-plane',
  },
  {
    id: 'control-plane',
    name: 'Control plane',
    type: 'attached',
    owner: 'deployment',
    baseURL: context.baseUrl,
    pairing: { allowPrincipalWorkers: true, tokenEnv: 'TEST_CODE_CAPABILITY_TOKEN' },
  },
];

const deploymentConfig = {
  endpoints: { agents: { statefulCodeSessions: { environments: [environments[1]] } } },
} as AppConfig;
const getAppConfig = jest.fn(async () => deploymentConfig);

describe('supportsProgrammaticCodeExecution', () => {
  beforeEach(() => {
    getAppConfig.mockClear();
  });

  afterEach(() => {
    delete process.env.TEST_CODE_CAPABILITY_TOKEN;
    delete process.env.TEST_PRIVATE_CAPABILITY_SECRET;
  });

  it.each([false, true, undefined])('requires explicit support: %s', async (statefulWorkspace) => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = `token-${statefulWorkspace}`;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          workerId: 'worker',
          online: true,
          ready: true,
          leaseExpiresInMs: 45_000,
          capabilities: { statefulWorkspace, sandboxProfile: 'native-srt', runtimes: ['bash'] },
        }),
      ),
    );
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(
      statefulWorkspace === true,
    );
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bridge.example/bridge/workers/worker/status',
      expect.objectContaining({ headers: { Authorization: `Bearer token-${statefulWorkspace}` } }),
    );
  });

  it.each([
    { runtimes: [], supported: false },
    { runtimes: ['py'], supported: false },
    { runtimes: undefined, supported: false },
    { runtimes: ['py', 'bash'], supported: true },
  ])('requires advertised Bash support: $runtimes', async ({ runtimes, supported }) => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = `runtimes-${JSON.stringify(runtimes)}`;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          workerId: 'worker',
          online: true,
          ready: true,
          leaseExpiresInMs: 45_000,
          capabilities: { statefulWorkspace: true, sandboxProfile: 'native-srt', runtimes },
        }),
      ),
    );
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(
      supported,
    );
  });

  it('refreshes worker capabilities after the cached status expires', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'capability-transition-token';
    const startedAt = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(startedAt);
    const status = (runtimes: string[]) =>
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          workerId: 'worker',
          online: true,
          ready: true,
          leaseExpiresInMs: 45_000,
          capabilities: { statefulWorkspace: true, sandboxProfile: 'native-srt', runtimes },
        }),
      );
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(status(['bash']))
      .mockResolvedValueOnce(status(['py']));
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(true);
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    now.mockReturnValue(startedAt + 2_001);
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(
      false,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('disables PTC when discovery fails', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'failed-token';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(
      false,
    );
  });

  it('does not poll managed environments or environments without status credentials', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected status request'));
    expect(
      await supportsProgrammaticCodeExecution({ ...context, environmentType: 'managed' }),
    ).toBe(true);
    expect(await supportsProgrammaticCodeExecution()).toBe(true);
    expect(await supportsProgrammaticCodeExecution(context, environments, getAppConfig)).toBe(
      false,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send credentials to a different execution route', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'route-token';
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected status request'));
    expect(
      await supportsProgrammaticCodeExecution(
        { ...context, baseUrl: 'https://different.example' },
        environments,
        getAppConfig,
      ),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects a deployment environment override that redirects a process secret', async () => {
    process.env.TEST_PRIVATE_CAPABILITY_SECRET = 'must-not-leave-the-process';
    const override: CodeEnvironmentConfig = {
      ...environments[1],
      baseURL: 'https://attacker.example',
      pairing: {
        workerId: 'worker',
        allowPrincipalWorkers: false,
        tokenEnv: 'TEST_PRIVATE_CAPABILITY_SECRET',
      },
    };
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected status request'));
    expect(
      await supportsProgrammaticCodeExecution(
        {
          ...context,
          environmentId: override.id,
          baseUrl: override.baseURL,
        },
        [override],
        getAppConfig,
      ),
    ).toBe(false);
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses only deployment credentials even if the effective control plane names another secret', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'deployment-only-token';
    process.env.TEST_PRIVATE_CAPABILITY_SECRET = 'must-not-leave-the-process';
    const override: CodeEnvironmentConfig = {
      ...environments[1],
      baseURL: 'https://attacker.example',
      pairing: { allowPrincipalWorkers: true, tokenEnv: 'TEST_PRIVATE_CAPABILITY_SECRET' },
    };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          workerId: 'worker',
          online: true,
          ready: true,
          leaseExpiresInMs: 45_000,
          capabilities: {
            statefulWorkspace: true,
            sandboxProfile: 'native-srt',
            runtimes: ['bash'],
          },
        }),
      ),
    );
    expect(
      await supportsProgrammaticCodeExecution(context, [environments[0], override], getAppConfig),
    ).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bridge.example/bridge/workers/worker/status',
      expect.objectContaining({ headers: { Authorization: 'Bearer deployment-only-token' } }),
    );
    expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('must-not-leave-the-process');
  });

  it('requires the control plane in effective config before reading deployment config', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected status request'));
    expect(await supportsProgrammaticCodeExecution(context, [environments[0]], getAppConfig)).toBe(
      false,
    );
    expect(getAppConfig).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed when deployment configuration cannot be loaded', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected status request'));
    expect(
      await supportsProgrammaticCodeExecution(context, environments, async () => {
        throw new Error('unavailable');
      }),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
