jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      debug: jest.fn(),
    },
  }),
  { virtual: true },
);

const originalFetch = global.fetch;
const langfuseEnvKeys = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_BASEURL',
  'LANGFUSE_TRACING_ENABLED',
  'LANGFUSE_SAMPLE_RATE',
  'LANGFUSE_TRACING_ENVIRONMENT',
];

function clearLangfuseEnv() {
  for (const key of langfuseEnvKeys) {
    delete process.env[key];
  }
}

function setLangfuseCredentials() {
  process.env.LANGFUSE_PUBLIC_KEY = 'public-key';
  process.env.LANGFUSE_SECRET_KEY = 'secret-key';
}

function loadService() {
  jest.resetModules();
  return require('./Langfuse');
}

describe('Langfuse feedback scores', () => {
  beforeEach(() => {
    clearLangfuseEnv();
    setLangfuseCredentials();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    clearLangfuseEnv();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('posts feedback scores when Langfuse tracing is enabled by default', async () => {
    const { sendFeedbackScore } = loadService();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp', tag: 'helpful', text: 'nice' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
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
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      id: 'feedback-trace-id',
      traceId: 'trace-id',
      name: 'user-feedback',
      value: 1,
      dataType: 'BOOLEAN',
      comment: 'helpful — nice',
      metadata: { rating: 'thumbsUp', tag: 'helpful' },
    });
  });

  it('skips scores when Langfuse tracing is disabled', async () => {
    process.env.LANGFUSE_TRACING_ENABLED = 'false';
    const { sendFeedbackScore } = loadService();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsDown' },
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips scores when Langfuse sampling is set to zero', async () => {
    process.env.LANGFUSE_SAMPLE_RATE = '0';
    const { sendFeedbackScore } = loadService();

    await sendFeedbackScore({
      traceId: 'trace-id',
      feedback: { rating: 'thumbsUp' },
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
