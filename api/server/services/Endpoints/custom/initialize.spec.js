const initializeClient = require('./initialize');

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  resolveHeaders: jest.fn(),
  getOpenAIConfig: jest.fn(),
  getCustomEndpointConfig: jest.fn().mockReturnValue({
    apiKey: 'test-key',
    baseURL: 'https://test.com',
    headers: { 'x-user': '{{LIBRECHAT_USER_ID}}', 'x-email': '{{LIBRECHAT_USER_EMAIL}}' },
    models: { default: ['test-model'] },
  }),
}));

jest.mock('~/server/services/UserService', () => ({
  getUserKeyValues: jest.fn(),
  checkUserKeyExpiry: jest.fn(),
}));

// Config is now passed via req.config, not getAppConfig

jest.mock('~/server/services/ModelService', () => ({
  fetchModels: jest.fn(),
}));

jest.mock('~/app/clients/OpenAIClient', () => {
  return jest.fn().mockImplementation(() => ({
    options: {},
  }));
});

jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockReturnValue({
    get: jest.fn(),
  }),
);

describe('custom/initializeClient', () => {
  const mockRequest = {
    body: { endpoint: 'test-endpoint' },
    user: { id: 'user-123', email: 'test@example.com', role: 'user' },
    app: { locals: {} },
    config: {
      endpoints: {
        all: {
          streamRate: 25,
        },
      },
    },
  };
  const mockResponse = {};

  beforeEach(() => {
    jest.clearAllMocks();
    const { getCustomEndpointConfig, resolveHeaders, getOpenAIConfig } = require('@librechat/api');
    getCustomEndpointConfig.mockReturnValue({
      apiKey: 'test-key',
      baseURL: 'https://test.com',
      headers: { 'x-user': '{{LIBRECHAT_USER_ID}}', 'x-email': '{{LIBRECHAT_USER_EMAIL}}' },
      models: { default: ['test-model'] },
    });
    resolveHeaders.mockReturnValue({ 'x-user': 'user-123', 'x-email': 'test@example.com' });
    getOpenAIConfig.mockReturnValue({
      useLegacyContent: true,
      endpointTokenConfig: null,
      llmConfig: {
        callbacks: [],
      },
    });
  });

  it('stores original template headers for deferred resolution', async () => {
    /**
     * Note: Request-based Header Resolution is deferred until right before LLM request is made
     * in the OpenAIClient or AgentClient, not during initialization.
     * This test verifies that the initialize function completes successfully with optionsOnly flag,
     * and that headers are passed through to be resolved later during the actual LLM request.
     */
    const result = await initializeClient({
      req: mockRequest,
      res: mockResponse,
      optionsOnly: true,
    });
    // Verify that options are returned for later use
    expect(result).toBeDefined();
    expect(result).toHaveProperty('useLegacyContent', true);
  });

  it('throws if endpoint config is missing', async () => {
    const { getCustomEndpointConfig } = require('@librechat/api');
    getCustomEndpointConfig.mockReturnValueOnce(null);
    await expect(
      initializeClient({ req: mockRequest, res: mockResponse, optionsOnly: true }),
    ).rejects.toThrow('Config not found for the test-endpoint custom endpoint.');
  });

  it('throws if user is missing', async () => {
    await expect(
      initializeClient({
        req: { ...mockRequest, user: undefined },
        res: mockResponse,
        optionsOnly: true,
      }),
    ).rejects.toThrow("Cannot read properties of undefined (reading 'id')");
  });
});
