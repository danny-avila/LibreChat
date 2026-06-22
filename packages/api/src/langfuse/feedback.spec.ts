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
  'LANGFUSE_FANOUT_ENABLED',
  'LANGFUSE_FANOUT_COLLECTOR_URL',
  'LANGFUSE_FANOUT_TENANT_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_DESTINATIONS',
  'LANGFUSE_FANOUT_TENANT_EU_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_US_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_JP_BASE_URL',
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

function enableTenantFanout() {
  process.env.LANGFUSE_FANOUT_ENABLED = 'true';
  process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector:4318';
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

function getCentralAuthorization(): string {
  return getTenantAuthorization('public-key', 'secret-key');
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
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
          baseUrl: 'http://tenant-langfuse:3000',
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
          Authorization: getCentralAuthorization(),
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

  it('skips tenant feedback scores when tenant keys are configured without a tenant base URL', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('posts tenant feedback scores to the configured destination for the tenant base URL', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('deletes feedback scores from central and tenant Langfuse projects', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
    process.env.LANGFUSE_FANOUT_TENANT_BASE_URL = 'http://tenant-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: null,
      appConfig: {
        langfuse: {
          publicKey: 'tenant-public-key',
          secretKey: 'tenant-secret-key',
          baseUrl: 'http://tenant-langfuse:3000',
        },
      } as AppConfig,
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchMock()).toHaveBeenNthCalledWith(
      1,
      'http://central-langfuse:3000/api/public/scores/feedback-trace-id',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: getCentralAuthorization() },
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
    enableTenantFanout();
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
        baseUrl: 'http://tenant-langfuse:3000',
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
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when tenant Langfuse enabled is the string false', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        enabled: 'false',
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://cloud.langfuse.com',
      } as unknown as AppConfig['langfuse']),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when tenant fanout export is disabled but keeps central scores', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('does not disable tenant scores for a blank emergency toggle', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
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

  it.each(['true', '1', 'yes', 'on'])(
    'disables tenant scores when the emergency toggle is %s',
    async (value) => {
      enableTenantFanout();
      process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
      process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = value;
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

      expect(getFetchMock()).toHaveBeenCalledTimes(1);
      expect(getFetchMock()).toHaveBeenCalledWith(
        'http://central-langfuse:3000/api/public/scores',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
        }),
      );
    },
  );

  it.each(['false', '0', 'no', 'off'])(
    'does not disable tenant scores when the emergency toggle is %s',
    async (value) => {
      enableTenantFanout();
      process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
      process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = value;
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
        'https://cloud.langfuse.com/api/public/scores',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: getTenantAuthorization() }),
        }),
      );
    },
  );

  it('skips tenant scores when global fanout is disabled', async () => {
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when tenant fanout is disabled in app config', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://cloud.langfuse.com',
        fanout: { enabled: false },
      }),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when tenant fanout enabled is the string false', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
    const { sendFeedbackScore } = await loadFeedback();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
      appConfig: appConfigWithLangfuse({
        publicKey: 'tenant-public-key',
        secretKey: 'tenant-secret-key',
        baseUrl: 'https://cloud.langfuse.com',
        fanout: { enabled: 'false' },
      } as unknown as AppConfig['langfuse']),
    });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('skips tenant scores when fanout has no collector URL', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'http://central-langfuse:3000/api/public/scores',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
      }),
    );
  });

  it('deduplicates matching central and tenant score destinations', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_PUBLIC_KEY = 'tenant-public-key';
    process.env.LANGFUSE_SECRET_KEY = 'tenant-secret-key';
    process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
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

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(getFetchMock()).toHaveBeenCalledWith(
      'https://cloud.langfuse.com/api/public/scores',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('attempts every destination and reports partial feedback score failures', async () => {
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
          baseUrl: 'http://tenant-langfuse:3000',
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
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
          baseUrl: 'http://tenant-langfuse:3000',
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
    enableTenantFanout();
    process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
          baseUrl: 'http://tenant-langfuse:3000',
        }),
      }),
    ).rejects.toThrow(
      'langfuse central score create failed: score create 500: central down; langfuse tenant score create failed: score create 503: tenant down',
    );

    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it.each(['false', '0', 'no', 'off'])(
    'skips scores when Langfuse tracing is disabled with %s',
    async (value) => {
      process.env.LANGFUSE_TRACING_ENABLED = value;
      const { sendFeedbackScore } = await loadFeedback();

      await sendFeedbackScore({
        traceId: 'trace-id',
        feedback: { rating: 'thumbsDown' },
      });

      expect(getFetchMock()).not.toHaveBeenCalled();
    },
  );

  it.each(['true', '1', 'yes', 'on'])(
    'enables tenant scores when global fanout is %s',
    async (value) => {
      process.env.LANGFUSE_FANOUT_ENABLED = value;
      process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector:4318';
      process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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
        'https://cloud.langfuse.com/api/public/scores',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: getTenantAuthorization() }),
        }),
      );
    },
  );

  it.each(['false', '0', 'no', 'off'])(
    'keeps tenant scores disabled when global fanout is %s',
    async (value) => {
      process.env.LANGFUSE_FANOUT_ENABLED = value;
      process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector:4318';
      process.env.LANGFUSE_BASE_URL = 'http://central-langfuse:3000';
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

      expect(getFetchMock()).toHaveBeenCalledTimes(1);
      expect(getFetchMock()).toHaveBeenCalledWith(
        'http://central-langfuse:3000/api/public/scores',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: getCentralAuthorization() }),
        }),
      );
    },
  );

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
