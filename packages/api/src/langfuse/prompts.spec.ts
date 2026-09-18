import type { AppConfig } from '@librechat/data-schemas';
import type { LangfuseScoreDestination } from './destinations';
import { resolveLangfusePromptDestinations } from './destinations';
import { createLangfusePromptProvider } from './prompts';

const destination: LangfuseScoreDestination = {
  name: 'connection',
  baseUrl: 'https://langfuse.example.com/',
  authorization: 'Basic secret',
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const prompt = {
  name: 'agent-policy',
  version: 7,
  type: 'text',
  prompt: 'Follow the policy.',
};

describe('Langfuse agent instruction prompts', () => {
  it('uses the latest label when no version is pinned', async () => {
    const fetch = jest.fn().mockResolvedValue(response(200, prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
    });

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).resolves.toMatchObject({ prompt: 'Follow the policy.', version: 7 });
    expect(fetch).toHaveBeenCalledWith(
      'https://langfuse.example.com/api/public/v2/prompts/agent-policy?label=latest',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Basic secret' }),
      }),
    );
  });

  it('requests an explicit version when pinned', async () => {
    const fetch = jest.fn().mockResolvedValue(response(200, prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
    });

    await provider.resolve(
      { source: 'langfuse', name: 'agent-policy', version: 7 },
      { userId: 'user-1' },
    );

    expect(fetch.mock.calls[0][0]).toBe(
      'https://langfuse.example.com/api/public/v2/prompts/agent-policy?version=7',
    );
  });

  it('returns a fresh cached value without another request', async () => {
    const fetch = jest.fn().mockResolvedValue(response(200, prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
    });

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' });
    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).resolves.toMatchObject({ cached: true, version: 7 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('evaluates cached freshness with the current request cache TTL', async () => {
    let now = 0;
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, { ...prompt, prompt: 'First response' }))
      .mockResolvedValueOnce(response(200, { ...prompt, prompt: 'Second response' }));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 100,
      now: () => now,
    });
    const longLivedContext = {
      userId: 'user-1',
      appConfig: {
        langfuse: { prompts: { cacheTtlMs: 100, requestTimeoutMs: 25 } },
      } as AppConfig,
    };
    const noCacheContext = {
      userId: 'user-1',
      appConfig: {
        langfuse: { prompts: { cacheTtlMs: 0, requestTimeoutMs: 25 } },
      } as AppConfig,
    };

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, longLivedContext);
    now = 1;

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, noCacheContext),
    ).resolves.toMatchObject({ prompt: 'Second response' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('restores an expired cached value only after a transient failure', async () => {
    let now = 0;
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, prompt))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 10,
      now: () => now,
    });

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' });
    now = 11;

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).resolves.toMatchObject({ cached: true, prompt: 'Follow the policy.' });
  });

  it.each([401, 403, 404])('never restores cached content for status %s', async (status) => {
    let now = 0;
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, prompt))
      .mockResolvedValueOnce(response(status, {}));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 10,
      now: () => now,
    });

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' });
    now = 11;

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: status === 404 ? 404 : 403, retryable: false });
  });

  it('rejects chat prompts because agent instructions must be text', async () => {
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch: jest.fn().mockResolvedValue(response(200, { ...prompt, type: 'chat', prompt: [] })),
    });

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'unsupported_type', statusCode: 422 });
  });
  it('isolates cached prompts by gateway headers', async () => {
    let headers = { 'x-tenant': 'tenant-a' };
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, { ...prompt, prompt: 'Tenant A' }))
      .mockResolvedValueOnce(response(200, { ...prompt, prompt: 'Tenant B' }));
    const provider = createLangfusePromptProvider({
      resolveDestinations: async () => [{ ...destination, headers }],
      fetch,
    });

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).resolves.toMatchObject({ prompt: 'Tenant A' });
    headers = { 'x-tenant': 'tenant-b' };
    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).resolves.toMatchObject({ prompt: 'Tenant B' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('evicts expired entries while retaining the current entry for transient fallback', async () => {
    let now = 0;
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, prompt))
      .mockResolvedValueOnce(response(200, { ...prompt, name: 'other-policy' }))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 10,
      now: () => now,
    });

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' });
    now = 11;
    await provider.resolve({ source: 'langfuse', name: 'other-policy' }, { userId: 'user-1' });

    await expect(
      provider.resolve({ source: 'langfuse', name: 'agent-policy' }, { userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'retrieval_failed', retryable: true });
  });

  it('uses schema-backed cache and request limits from app config', async () => {
    let now = 0;
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    const fetch = jest.fn().mockResolvedValue(response(200, prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 100,
      timeoutMs: 100,
      now: () => now,
    });
    const context = {
      userId: 'user-1',
      appConfig: {
        langfuse: { prompts: { cacheTtlMs: 5, requestTimeoutMs: 25 } },
      } as AppConfig,
    };

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, context);
    now = 6;
    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenCalledWith(25);
  });

  it('cancels prompt retrieval with the owning run and does not restore stale content', async () => {
    let now = 0;
    const controller = new AbortController();
    const reason = new Error('run cancelled');
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, prompt))
      .mockImplementationOnce((_url, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted) {
            reject(init.signal.reason);
            return;
          }
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
      });
    const provider = createLangfusePromptProvider({
      resolveDestinations: jest.fn().mockResolvedValue([destination]),
      fetch,
      cacheTtlMs: 10,
      now: () => now,
    });
    const context = { userId: 'user-1', signal: controller.signal };

    await provider.resolve({ source: 'langfuse', name: 'agent-policy' }, context);
    now = 11;
    const pending = provider.resolve({ source: 'langfuse', name: 'agent-policy' }, context);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(fetch.mock.calls[1][1].signal).not.toBe(controller.signal);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });
  it('resolves prompt credentials while trace export is disabled', async () => {
    const previous = {
      tracing: process.env.LANGFUSE_TRACING_ENABLED,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      projectId: process.env.LANGFUSE_PROJECT_ID,
    };
    Object.assign(process.env, {
      LANGFUSE_TRACING_ENABLED: 'false',
      LANGFUSE_PUBLIC_KEY: 'public-key',
      LANGFUSE_SECRET_KEY: 'secret-key',
      LANGFUSE_PROJECT_ID: 'project-id',
    });
    try {
      await expect(resolveLangfusePromptDestinations()).resolves.toEqual([
        expect.objectContaining({
          name: 'central',
          baseUrl: 'https://cloud.langfuse.com',
        }),
      ]);
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      };
      restore('LANGFUSE_TRACING_ENABLED', previous.tracing);
      restore('LANGFUSE_PUBLIC_KEY', previous.publicKey);
      restore('LANGFUSE_SECRET_KEY', previous.secretKey);
      restore('LANGFUSE_PROJECT_ID', previous.projectId);
    }
  });
});
