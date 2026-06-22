import type { AppConfig } from '@librechat/data-schemas';

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
    },
  }),
  { virtual: true },
);

const langfuseEnvKeys = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_HOST',
  'LANGFUSE_BASEURL',
  'LANGFUSE_TRACING_ENABLED',
  'LANGFUSE_SAMPLE_RATE',
  'LANGFUSE_TRACING_ENVIRONMENT',
  'LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER',
  'LANGFUSE_FANOUT_CENTRAL_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_DESTINATIONS',
  'LANGFUSE_FANOUT_TENANT_EU_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_US_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_JP_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_HIPAA_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED',
];
let fetchMock: jest.SpiedFunction<typeof fetch>;

function clearLangfuseEnv() {
  for (const key of langfuseEnvKeys) {
    delete process.env[key];
  }
}

function setLangfuseCredentials() {
  process.env.LANGFUSE_PUBLIC_KEY = 'public-key';
  process.env.LANGFUSE_SECRET_KEY = 'secret-key';
}

async function loadFeedback(): Promise<typeof import('./feedback')> {
  jest.resetModules();
  return import('./feedback');
}

function getFetchMock(): jest.SpiedFunction<typeof fetch> {
  return fetchMock;
}

function getTenantAuthorization(
  publicKey = 'tenant-public-key',
  secretKey = 'tenant-secret-key',
): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

function appConfigWithLangfuse(langfuse: AppConfig['langfuse']): AppConfig {
  return { langfuse } as AppConfig;
}

describe('Langfuse feedback scores', () => {
  beforeEach(() => {
    clearLangfuseEnv();
    setLangfuseCredentials();
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    clearLangfuseEnv();
    fetchMock.mockRestore();
    jest.clearAllMocks();
  });

  it('posts feedback scores when Langfuse tracing is enabled by default', async () => {
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp', tag: 'helpful', text: 'nice' },
      metadata: {
        messageId: 'message-id',
        conversationId: 'conversation-id',
        sessionId: 'conversation-id',
        userId: 'user-id',
        endpoint: 'agents',
        empty: '',
        missing: undefined,
      },
      observationId: 'observation-id',
    });

    expect(getFetchMock()).toHaveBeenCalledWith(
      'https://cloud.langfuse.com/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('public-key:secret-key').toString('base64')}`,
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
    );
    const [, init] = getFetchMock().mock.calls[0];
    expect(JSON.parse(init?.body as string)).toMatchObject({
      id: 'feedback-trace-id',
      traceId: 'trace-id',
      name: 'user-feedback',
      value: 1,
      dataType: 'BOOLEAN',
      comment: 'helpful — nice',
      observationId: 'observation-id',
      metadata: {
        rating: 'thumbsUp',
        tag: 'helpful',
        messageId: 'message-id',
        conversationId: 'conversation-id',
        sessionId: 'conversation-id',
        userId: 'user-id',
        endpoint: 'agents',
      },
    });
    expect(JSON.parse(init?.body as string).metadata).not.toHaveProperty('empty');
    expect(JSON.parse(init?.body as string).metadata).not.toHaveProperty('missing');
  });

  it('posts feedback scores to the configured Langfuse host', async () => {
    process.env.LANGFUSE_HOST = 'http://langfuse-server:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
    });

    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://langfuse-server:3000/api/public/scores',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts feedback scores to central fanout and tenant Langfuse projects', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsDown', tag: 'wrong' },
      metadata: { tenantId: 'tenant-a' },
      appConfig: {
        langfuse: {
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
        },
      } as AppConfig,
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchMock()).toHaveBeenNthCalledWith(
      1,
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Basic central-auth',
        }),
      }),
    );
    expect(getFetchMock()).toHaveBeenNthCalledWith(
      2,
      'http://tenant-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: getTenantAuthorization(),
        }),
      }),
    );
    const [, tenantInit] = getFetchMock().mock.calls[1];
    expect(JSON.parse(tenantInit?.body as string)).toMatchObject({
      id: 'feedback-trace-id',
      traceId: 'trace-id',
      name: 'user-feedback',
      value: 0,
      metadata: {
        rating: 'thumbsDown',
        tag: 'wrong',
        tenantId: 'tenant-a',
      },
    });
  });

  it('posts tenant feedback scores to the configured destination for the tenant base URL', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://us.cloud.langfuse.com',
      }),
    });

    expect(getFetchMock()).toHaveBeenNthCalledWith(
      2,
      'https://us.cloud.langfuse.com/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: getTenantAuthorization(),
        }),
      }),
    );
  });

  it('skips tenant feedback scores when the tenant base URL is not a configured destination', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_DESTINATIONS = 'eu=https://cloud.langfuse.com';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://unconfigured-langfuse.example.com',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Basic central-auth' }),
      }),
    );
  });

  it('deletes feedback scores from central and tenant Langfuse projects', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: null,
      appConfig: {
        langfuse: {
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
        },
      } as AppConfig,
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchMock()).toHaveBeenNthCalledWith(
      1,
      'http://central-langfuse:3000/api/public/scores/feedback-trace-id',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Basic central-auth' },
      }),
    );
    expect(getFetchMock()).toHaveBeenNthCalledWith(
      2,
      'http://tenant-langfuse:3000/api/public/scores/feedback-trace-id',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          Authorization: getTenantAuthorization(),
        },
      }),
    );
  });

  it('posts feedback scores to tenant Langfuse when no central destination is configured', async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://tenant-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getTenantAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when tenant Langfuse is disabled but keeps central scores', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        enabled: false,
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Basic central-auth' }),
      }),
    );
  });

  it('skips tenant scores when tenant fanout export is disabled but keeps central scores', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = 'true';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Basic central-auth' }),
      }),
    );
  });

  it('does not disable tenant scores for a blank emergency toggle', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = '  ';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://cloud.langfuse.com',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Basic central-auth' }),
      }),
    );
    expect(getFetchMock()).toHaveBeenCalledWith(
      'https://cloud.langfuse.com/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getTenantAuthorization() }),
      }),
    );
  });

  it('only disables tenant scores when the emergency toggle is true', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = '1';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://cloud.langfuse.com',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Basic central-auth' }),
      }),
    );
    expect(getFetchMock()).toHaveBeenCalledWith(
      'https://cloud.langfuse.com/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getTenantAuthorization() }),
      }),
    );
  });

  it('deduplicates matching central and tenant score destinations', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = getTenantAuthorization();
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://shared-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'http://shared-langfuse:3000',
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://shared-langfuse:3000/api/public/scores',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('attempts every destination and reports partial feedback score failures', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    fetchMock
      .mockResolvedValueOnce(new Response('central down', { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const { sendFeedbackScore } = await loadFeedback();
    const { logger } = await import('@librechat/data-schemas');

    await expect(
      sendFeedbackScore({
        traceId: 'trace-id',
        feedback: { rating: 'thumbsUp' },
        appConfig: appConfigWithLangfuse({
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
        }),
      }),
    ).rejects.toThrow('langfuse central score create failed: score create 500: central down');

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[langfuse] central feedback score send failed'),
      expect.any(Error),
    );
  });

  it('reports tenant feedback score failures after central succeeds', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response('tenant down', { status: 503 }));
    const { sendFeedbackScore } = await loadFeedback();
    const { logger } = await import('@librechat/data-schemas');

    await expect(
      sendFeedbackScore({
        traceId: 'trace-id',
        feedback: { rating: 'thumbsUp' },
        appConfig: appConfigWithLangfuse({
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
        }),
      }),
    ).rejects.toThrow('langfuse tenant score create failed: score create 503: tenant down');

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[langfuse] central feedback score sent'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[langfuse] tenant feedback score send failed'),
      expect.any(Error),
    );
  });

  it('aggregates feedback score failures when every destination fails', async () => {
    process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER = 'Basic central-auth';
    process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    fetchMock
      .mockResolvedValueOnce(new Response('central down', { status: 500 }))
      .mockResolvedValueOnce(new Response('tenant down', { status: 503 }));
    const { sendFeedbackScore } = await loadFeedback();

    await expect(
      sendFeedbackScore({
        traceId: 'trace-id',
        feedback: { rating: 'thumbsUp' },
        appConfig: appConfigWithLangfuse({
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
        }),
      }),
    ).rejects.toThrow(
      'langfuse central score create failed: score create 500: central down; langfuse tenant score create failed: score create 503: tenant down',
    );

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it('skips scores when Langfuse tracing is disabled', async () => {
    process.env.LANGFUSE_TRACING_ENABLED = 'false';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsDown' },
    });

    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it('skips scores when Langfuse sampling is set to zero', async () => {
    process.env.LANGFUSE_SAMPLE_RATE = '0';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
    });

    expect(getFetchMock()).not.toHaveBeenCalled();
  });
});
