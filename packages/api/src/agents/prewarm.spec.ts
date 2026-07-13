import {
  markSandboxReady,
  maybePrewarmCodeSandbox,
  resetSandboxStateForTests,
  shouldSignalSandboxStart,
} from './prewarm';

type PrewarmParams = Parameters<typeof maybePrewarmCodeSandbox>[0];

const req = {} as PrewarmParams['req'];
const statefulAgent = { id: 'agent_stateful', statefulCodeSessions: true };
const plainAgent = { id: 'agent_plain', statefulCodeSessions: false };

function agents(...list: Array<Record<string, unknown>>): PrewarmParams['agents'] {
  return list as unknown as PrewarmParams['agents'];
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockResponse(init: { ok: boolean; status: number }): Response {
  return { ...init, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
}

describe('maybePrewarmCodeSandbox', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    resetSandboxStateForTests();
    process.env.LIBRECHAT_CODE_BASEURL = 'http://code.test/v1';
    delete process.env.CODE_SANDBOX_PREWARM;
    delete process.env.CODE_SANDBOX_COLD_AFTER_MS;
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ ok: true, status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it('does nothing when no reachable agent has stateful sessions', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(plainAgent) });
    await flushAsync();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);
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
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);
  });

  it('walks subagent configs for the stateful gate', async () => {
    const parent = { id: 'agent_parent', subagentAgentConfigs: [statefulAgent] };
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(parent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refire within the warm window', async () => {
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refires once the warm window has expired', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);

    jest.setSystemTime(new Date('2026-07-13T01:00:00Z'));
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps signaling when the prewarm request fails, without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
  });

  it('treats a non-2xx prewarm response as a failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 503 }));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
  });

  it('prewarms again after a short cold-after window even within the fire cooldown', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    process.env.CODE_SANDBOX_COLD_AFTER_MS = '30000';
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-07-13T00:00:45Z'));
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
  });
});

describe('shouldSignalSandboxStart / markSandboxReady', () => {
  beforeEach(() => {
    resetSandboxStateForTests();
    delete process.env.CODE_SANDBOX_COLD_AFTER_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never signals for untracked conversations (stateless deployments)', () => {
    expect(shouldSignalSandboxStart('never-seen')).toBe(false);
    expect(shouldSignalSandboxStart(null)).toBe(false);
    expect(shouldSignalSandboxStart(undefined)).toBe(false);
  });

  it('stops signaling after a real tool call marks the sandbox ready', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => undefined));
    maybePrewarmCodeSandbox({ req, conversationId: 'convo-1', agents: agents(statefulAgent) });
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);

    markSandboxReady('convo-1');
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);
    fetchMock.mockRestore();
  });

  it('honors CODE_SANDBOX_COLD_AFTER_MS overrides', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    process.env.CODE_SANDBOX_COLD_AFTER_MS = '1000';
    markSandboxReady('convo-1');
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);
    jest.setSystemTime(new Date('2026-07-13T00:00:02Z'));
    expect(shouldSignalSandboxStart('convo-1')).toBe(true);
  });

  it('never signals when the kill switch is on, even for tracked conversations', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    process.env.CODE_SANDBOX_PREWARM = 'false';
    process.env.CODE_SANDBOX_COLD_AFTER_MS = '1000';
    markSandboxReady('convo-1');
    jest.setSystemTime(new Date('2026-07-13T00:00:05Z'));
    expect(shouldSignalSandboxStart('convo-1')).toBe(false);
    delete process.env.CODE_SANDBOX_PREWARM;
  });
});
