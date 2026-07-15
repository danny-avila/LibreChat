import {
  markSandboxReady,
  maybePrewarmCodeSandbox,
  resetSandboxStateForTests,
  shouldSignalSandboxStart,
} from './prewarm';

type PrewarmParams = Parameters<typeof maybePrewarmCodeSandbox>[0];

interface TestAgent {
  id: string;
  statefulCodeSessions?: boolean;
  subagentAgentConfigs?: TestAgent[];
}

const req = {} as PrewarmParams['req'];
const statefulAgent: TestAgent = { id: 'agent_stateful', statefulCodeSessions: true };
const plainAgent: TestAgent = { id: 'agent_plain', statefulCodeSessions: false };

function agents(...list: TestAgent[]): PrewarmParams['agents'] {
  return list as PrewarmParams['agents'];
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockResponse(init: { ok: boolean; status: number }): Response {
  return { ...init, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
}

describe('maybePrewarmCodeSandbox', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    await resetSandboxStateForTests();
    process.env.LIBRECHAT_CODE_BASEURL = 'http://code.test/v1';
    delete process.env.CODE_SANDBOX_PREWARM;
    delete process.env.CODE_SANDBOX_COLD_AFTER_MS;
    delete process.env.CODEAPI_JWT_ENABLED;
    delete process.env.CODEAPI_AUTH_PROVIDER;
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ ok: true, status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
    delete process.env.LIBRECHAT_CODE_BASEURL;
  });

  it('does nothing when no reachable agent has stateful sessions', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(plainAgent) });
    await flushAsync();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(false);
  });

  it('does nothing without a conversationId', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: null, agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects the CODE_SANDBOX_PREWARM=false kill switch', async () => {
    process.env.CODE_SANDBOX_PREWARM = 'false';
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires one exec with the conversation as runtime_session_hint and marks ready', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://code.test/v1/exec');
    expect(JSON.parse(init.body as string)).toEqual({
      lang: 'bash',
      code: 'true',
      runtime_session_hint: 'convo-1',
    });
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(false);
  });

  it('walks subagent configs for the stateful gate', async () => {
    const parent = { id: 'agent_parent', subagentAgentConfigs: [statefulAgent] };
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(parent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refire while the warm marker is fresh', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refire while a prewarm is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refires once the warm marker has expired', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-07-13T01:00:00Z'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prewarms again after a short cold-after window even within the fire cooldown', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    process.env.CODE_SANDBOX_COLD_AFTER_MS = '30000';
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-07-13T00:00:45Z'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('signals while a prewarm is in flight and stops after it completes', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(true);

    resolveFetch?.(mockResponse({ ok: true, status: 200 }));
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(false);
  });

  it('keeps signaling when the prewarm request fails, without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(true);
  });

  it('treats a non-2xx prewarm response as a failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 503 }));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(true);
  });

  it('does not mark the sandbox ready when the 2xx body fails to drain', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        throw new Error('body aborted');
      },
    } as unknown as Response);
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(true);
  });
});

describe('shouldSignalSandboxStart / markSandboxReady', () => {
  beforeEach(async () => {
    await resetSandboxStateForTests();
    delete process.env.CODE_SANDBOX_PREWARM;
    delete process.env.CODE_SANDBOX_COLD_AFTER_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never signals for untracked conversations (stateless deployments)', async () => {
    await expect(shouldSignalSandboxStart('never-seen')).resolves.toBe(false);
    await expect(shouldSignalSandboxStart(null)).resolves.toBe(false);
    await expect(shouldSignalSandboxStart(undefined)).resolves.toBe(false);
  });

  it('stops signaling after a real tool call marks the sandbox ready', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => undefined));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(true);

    await markSandboxReady('convo-1');
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(false);
    fetchMock.mockRestore();
  });

  it('never signals when the kill switch is on, even with an in-flight prewarm', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => undefined));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    process.env.CODE_SANDBOX_PREWARM = 'false';
    await expect(shouldSignalSandboxStart('convo-1')).resolves.toBe(false);
    fetchMock.mockRestore();
  });
});
