jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      debug: jest.fn(),
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
      metadata: { rating: 'thumbsUp', tag: 'helpful' },
    });
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
