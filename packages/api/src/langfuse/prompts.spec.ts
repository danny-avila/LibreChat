import type { LangfuseScoreDestination } from './destinations';
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
});
