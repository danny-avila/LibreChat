import { ProxyAgent, fetch as undiciFetch } from 'undici';

import { fetchRemoteAuth } from './fetch';

jest.mock('undici', () => ({
  ProxyAgent: jest.fn((proxyUrl: string) => ({ proxyUrl })),
  fetch: jest.fn(),
}));

const fetchMock = undiciFetch as jest.MockedFunction<typeof undiciFetch>;

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe('fetchRemoteAuth', () => {
  const originalProxy = process.env.PROXY;
  const originalTimeout = process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS;

  beforeEach(() => {
    jest.useRealTimers();
    fetchMock.mockReset();
    (ProxyAgent as unknown as jest.Mock).mockClear();
    delete process.env.PROXY;
    delete process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS;
  });

  afterAll(() => {
    restoreEnvValue('PROXY', originalProxy);
    restoreEnvValue('REMOTE_AUTH_FETCH_TIMEOUT_MS', originalTimeout);
  });

  it('uses a proxy dispatcher and abort signal for remote auth fetches', async () => {
    const response = { ok: true, status: 200, json: jest.fn() } as unknown as Response;
    process.env.PROXY = 'http://proxy.local:8080';
    fetchMock.mockResolvedValueOnce(response as unknown as Awaited<ReturnType<typeof undiciFetch>>);

    await expect(
      fetchRemoteAuth('https://issuer.example.com/.well-known/openid-configuration'),
    ).resolves.toBe(response);

    expect(ProxyAgent).toHaveBeenCalledWith('http://proxy.local:8080');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.example.com/.well-known/openid-configuration',
      expect.objectContaining({
        dispatcher: { proxyUrl: 'http://proxy.local:8080' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('aborts before response headers arrive when the configured timeout elapses', async () => {
    jest.useFakeTimers();
    process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS = '25';
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const request = fetchRemoteAuth('https://issuer.example.com/userinfo');
    const requestError = request.then(
      () => undefined,
      (error) => error as Error,
    );
    await jest.advanceTimersByTimeAsync(25);

    await expect(requestError).resolves.toEqual(expect.objectContaining({ message: 'aborted' }));
  });

  it('clears the timeout when fetch fails before headers arrive', async () => {
    jest.useFakeTimers();
    process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS = '25';
    fetchMock.mockRejectedValueOnce(new Error('connect failed'));

    await expect(fetchRemoteAuth('https://issuer.example.com/userinfo')).rejects.toThrow(
      'connect failed',
    );

    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the timeout active until json body parsing finishes', async () => {
    jest.useFakeTimers();
    process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS = '25';
    const response = {
      ok: true,
      status: 200,
      json: jest.fn(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('aborted while reading body')), 25);
          }),
      ),
    } as Partial<Response> as Response;
    fetchMock.mockResolvedValueOnce(response as unknown as Awaited<ReturnType<typeof undiciFetch>>);

    const fetched = await fetchRemoteAuth('https://issuer.example.com/userinfo');
    const body = fetched.json();
    const bodyError = body.then(
      () => undefined,
      (error) => error as Error,
    );
    await jest.advanceTimersByTimeAsync(25);

    await expect(bodyError).resolves.toEqual(
      expect.objectContaining({ message: 'aborted while reading body' }),
    );
  });
});
