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

describe('supportsProgrammaticCodeExecution', () => {
  afterEach(() => {
    delete process.env.TEST_CODE_CAPABILITY_TOKEN;
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
    expect(await supportsProgrammaticCodeExecution(context, environments)).toBe(
      statefulWorkspace === true,
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bridge.example/bridge/workers/worker/status',
      expect.objectContaining({ headers: { Authorization: `Bearer token-${statefulWorkspace}` } }),
    );
  });

  it('disables PTC when discovery fails', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'failed-token';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await supportsProgrammaticCodeExecution(context, environments)).toBe(false);
  });

  it('does not poll managed environments or environments without status credentials', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(
      await supportsProgrammaticCodeExecution({ ...context, environmentType: 'managed' }),
    ).toBe(true);
    expect(await supportsProgrammaticCodeExecution()).toBe(true);
    expect(await supportsProgrammaticCodeExecution(context, environments)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send credentials to a different execution route', async () => {
    process.env.TEST_CODE_CAPABILITY_TOKEN = 'route-token';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(
      await supportsProgrammaticCodeExecution(
        { ...context, baseUrl: 'https://different.example' },
        environments,
      ),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
