import type { AppConfig } from '@librechat/data-schemas';

let encryptV3: typeof import('@librechat/data-schemas').encryptV3;
let getLangfuseDestinationId: typeof import('./destinations').getLangfuseDestinationId;
let resolveLangfusePromptDestinations: typeof import('./destinations').resolveLangfusePromptDestinations;
let createLangfusePromptProvider: typeof import('./prompts').createLangfusePromptProvider;
const previousKey = process.env.CREDS_KEY;

/** Encryption captures the key at module initialization, before any fixture can encrypt. */
beforeAll(async () => {
  process.env.CREDS_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  ({ encryptV3 } = await import('@librechat/data-schemas'));
  ({ getLangfuseDestinationId, resolveLangfusePromptDestinations } = await import(
    './destinations'
  ));
  ({ createLangfusePromptProvider } = await import('./prompts'));
});
afterAll(() => {
  if (previousKey == null) delete process.env.CREDS_KEY;
  else process.env.CREDS_KEY = previousKey;
});

const reference = { source: 'langfuse' as const, name: 'policy' };
const prompt = { name: 'policy', type: 'text', prompt: 'Instructions', version: 1 };
const configured: AppConfig = {
  langfuse: {
    enabled: true,
    destination: 'eu',
    publicKey: 'configured-public',
    secretKey: 'configured-secret',
    projectId: 'configured-project',
  },
} as AppConfig;

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Langfuse prompt routing and caller lifetimes', () => {
  const envKeys = [
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
    'LANGFUSE_PROJECT_ID',
    'LANGFUSE_BASE_URL',
    'LANGFUSE_FANOUT_TENANT_DESTINATIONS',
    'CREDS_KEY',
  ] as const;
  let previous: Array<string | undefined>;
  let sequence = 0;

  beforeEach(() => {
    previous = envKeys.map((key) => process.env[key]);
    process.env.CREDS_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    if (configured.langfuse) {
      configured.langfuse.secretKey = encryptV3('configured-secret');
    }
    process.env.LANGFUSE_PUBLIC_KEY = `lifecycle-public-${++sequence}`;
    process.env.LANGFUSE_SECRET_KEY = 'lifecycle-secret';
    process.env.LANGFUSE_BASE_URL = 'https://central.example.com';
    delete process.env.LANGFUSE_PROJECT_ID;
    delete process.env.LANGFUSE_FANOUT_TENANT_DESTINATIONS;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    envKeys.forEach((key, index) => {
      if (previous[index] == null) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });

  it.each([true, false])(
    'skips central discovery for new and saved configured references (project ID: %s)',
    async (stableIdentity) => {
      const lookup = deferred<Response>();
      const discovery = jest.spyOn(globalThis, 'fetch').mockReturnValue(lookup.promise);
      const fetch = jest.fn().mockImplementation(async () => Response.json(prompt));
      const provider = createLangfusePromptProvider({
        resolveDestinations: resolveLangfusePromptDestinations,
        fetch,
      });
      const appConfig = {
        ...configured,
        langfuse: {
          ...configured.langfuse,
          projectId: stableIdentity ? 'configured-project' : undefined,
        },
      } as AppConfig;
      const pending = provider.resolve(reference, { userId: 'author', appConfig });
      try {
        await nextTurn();
        expect(discovery).not.toHaveBeenCalled();
        const saved = await pending;
        await provider.resolve(
          { ...reference, destinationId: saved.destinationId },
          { userId: 'reader', appConfig },
        );
        expect(discovery).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(1);
      } finally {
        lookup.resolve(Response.json({ data: [{ id: 'central-project' }] }));
        await Promise.allSettled([pending]);
      }
    },
  );

  it('discovers a saved central binding even when a configured connection exists', async () => {
    const lookup = deferred<Response>();
    const discovery = jest.spyOn(globalThis, 'fetch').mockReturnValue(lookup.promise);
    const fetch = jest.fn().mockImplementation(async () => Response.json(prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: resolveLangfusePromptDestinations,
      fetch,
    });
    const destinationId = getLangfuseDestinationId(
      'https://central.example.com',
      'central-project',
    );
    const pending = provider.resolve(
      { ...reference, destinationId },
      { userId: 'reader', appConfig: configured },
    );
    await nextTurn();
    expect(discovery).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    lookup.resolve(Response.json({ data: [{ id: 'central-project' }] }));
    await expect(pending).resolves.toMatchObject({ destinationId });
    expect(fetch).toHaveBeenCalledWith(
      'https://central.example.com/api/public/v2/prompts/policy?label=latest',
      expect.anything(),
    );
  });

  it('does not retarget an unavailable saved binding to the configured connection', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: [{ id: 'central-project' }] }));
    const fetch = jest.fn();
    const provider = createLangfusePromptProvider({
      resolveDestinations: resolveLangfusePromptDestinations,
      fetch,
    });
    await expect(
      provider.resolve(
        { ...reference, destinationId: 'e'.repeat(64) },
        { userId: 'reader', appConfig: configured },
      ),
    ).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('detaches a cancelled central waiter without cancelling shared discovery', async () => {
    const lookup = deferred<Response>();
    const discovery = jest.spyOn(globalThis, 'fetch').mockReturnValue(lookup.promise);
    const fetch = jest.fn().mockImplementation(async () => Response.json(prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: resolveLangfusePromptDestinations,
      fetch,
    });
    const controller = new AbortController();
    const reason = new Error('cancel preview');
    const cancelled = provider.resolve(reference, {
      userId: 'cancelled',
      signal: controller.signal,
    });
    const healthy = provider.resolve(reference, { userId: 'healthy' });
    let rejected: Error | undefined;
    const observed = cancelled.catch((error: Error) => {
      rejected = error;
    });
    try {
      await nextTurn();
      controller.abort(reason);
      await nextTurn();
      expect(rejected).toBe(reason);
      expect(discovery).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      lookup.resolve(Response.json({ data: [{ id: 'central-project' }] }));
      await Promise.allSettled([observed, healthy]);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(healthy).resolves.toMatchObject({ prompt: 'Instructions' });
  });

  it('applies the configured request deadline while destination discovery is pending', async () => {
    const deadline = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const lookup = deferred<Awaited<ReturnType<typeof resolveLangfusePromptDestinations>>>();
    const fetch = jest.fn();
    const provider = createLangfusePromptProvider({
      resolveDestinations: () => lookup.promise,
      fetch,
    });
    const pending = provider.resolve(reference, {
      userId: 'reader',
      appConfig: { langfuse: { prompts: { requestTimeoutMs: 25 } } } as AppConfig,
    });
    let rejected: Error | undefined;
    const observed = pending.catch((error: Error) => {
      rejected = error;
    });
    try {
      deadline.abort(new DOMException('deadline', 'TimeoutError'));
      await nextTurn();
      expect(timeout).toHaveBeenCalledWith(25);
      expect(rejected).toMatchObject({ code: 'retrieval_failed', retryable: true });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      lookup.resolve([]);
      await observed;
    }
  });

  it('uses one deadline across discovery, fetch, and response parsing', async () => {
    const deadline = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const lookup = deferred<Awaited<ReturnType<typeof resolveLangfusePromptDestinations>>>();
    const body = deferred<typeof prompt>();
    const response = Response.json(prompt);
    jest.spyOn(response, 'json').mockReturnValue(body.promise);
    const fetch = jest.fn().mockResolvedValue(response);
    const provider = createLangfusePromptProvider({
      resolveDestinations: () => lookup.promise,
      fetch,
    });
    const pending = provider.resolve(reference, {
      userId: 'reader',
      appConfig: { langfuse: { prompts: { requestTimeoutMs: 25 } } } as AppConfig,
    });
    let rejected: Error | undefined;
    const observed = pending.catch((error: Error) => {
      rejected = error;
    });
    try {
      expect(timeout).toHaveBeenCalledTimes(1);
      lookup.resolve([
        {
          name: 'connection',
          baseUrl: 'https://configured.example.com',
          authorization: 'Basic configured',
        },
      ]);
      await nextTurn();
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: deadline.signal }),
      );
      expect(response.json).toHaveBeenCalled();
      expect(timeout).toHaveBeenCalledTimes(1);
      deadline.abort(new DOMException('deadline', 'TimeoutError'));
      await nextTurn();
      expect(rejected).toMatchObject({ code: 'retrieval_failed', retryable: true });
    } finally {
      body.resolve(prompt);
      await observed;
    }
  });

  it('rejects an already-cancelled caller even when its prompt is cached', async () => {
    const fetch = jest.fn().mockImplementation(async () => Response.json(prompt));
    const provider = createLangfusePromptProvider({
      resolveDestinations: resolveLangfusePromptDestinations,
      fetch,
    });
    await provider.resolve(reference, { userId: 'reader', appConfig: configured });
    const reason = new Error('already cancelled');
    await expect(
      provider.resolve(reference, {
        userId: 'reader',
        appConfig: configured,
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a response that finishes parsing after cancellation', async () => {
    const body = deferred<typeof prompt>();
    const firstResponse = Response.json(prompt);
    jest.spyOn(firstResponse, 'json').mockReturnValue(body.promise);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockImplementation(async () => Response.json({ ...prompt, version: 2 }));
    const provider = createLangfusePromptProvider({
      resolveDestinations: resolveLangfusePromptDestinations,
      fetch,
    });
    const controller = new AbortController();
    const reason = new Error('cancel during response');
    const pending = provider.resolve(reference, {
      userId: 'reader',
      appConfig: configured,
      signal: controller.signal,
    });
    await nextTurn();
    controller.abort(reason);
    body.resolve(prompt);
    await expect(pending).rejects.toBe(reason);
    await expect(
      provider.resolve(reference, { userId: 'reader', appConfig: configured }),
    ).resolves.toMatchObject({ version: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
