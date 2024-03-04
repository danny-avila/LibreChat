const { OpenAIClient } = require('~/app');
const initializeClient = require('./initializeClient');
const { getUserKey } = require('~/server/services/UserService');

// Mock getUserKey since it's the only function we want to mock
jest.mock('~/server/services/UserService', () => ({
  getUserKey: jest.fn(),
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
}));

describe('initializeClient', () => {
  // Set up environment variables
  const originalEnvironment = process.env;

  beforeEach(() => {
    jest.resetModules(); // Clears the cache
    process.env = { ...originalEnvironment }; // Make a copy
  });

  afterAll(() => {
    process.env = originalEnvironment; // Restore original env vars
  });

  test('should initialize client with OpenAI API key and default options', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.DEBUG_OPENAI = 'false';
    process.env.OPENAI_SUMMARIZE = 'false';

    const req = {
      body: { key: null, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.openAIApiKey).toBe('test-openai-api-key');
    expect(client.client).toBeInstanceOf(OpenAIClient);
  });

  test('should initialize client with Azure credentials when endpoint is azureOpenAI', async () => {
    process.env.AZURE_API_KEY = 'test-azure-api-key';
    (process.env.AZURE_OPENAI_API_INSTANCE_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_VERSION = 'some-value'),
    (process.env.AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME = 'some-value'),
    (process.env.OPENAI_API_KEY = 'test-openai-api-key');
    process.env.DEBUG_OPENAI = 'false';
    process.env.OPENAI_SUMMARIZE = 'false';

    const req = {
      body: { key: null, endpoint: 'azureOpenAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'test-model' } };

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.openAIApiKey).toBe('test-azure-api-key');
    expect(client.client).toBeInstanceOf(OpenAIClient);
  });

  test('should use the debug option when DEBUG_OPENAI is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.DEBUG_OPENAI = 'true';

    const req = {
      body: { key: null, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.client.options.debug).toBe(true);
  });

  test('should set contextStrategy to summarize when OPENAI_SUMMARIZE is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.OPENAI_SUMMARIZE = 'true';

    const req = {
      body: { key: null, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.client.options.contextStrategy).toBe('summarize');
  });

  test('should set reverseProxyUrl and proxy when they are provided in the environment', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.OPENAI_REVERSE_PROXY = 'http://reverse.proxy';
    process.env.PROXY = 'http://proxy';

    const req = {
      body: { key: null, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.client.options.reverseProxyUrl).toBe('http://reverse.proxy');
    expect(client.client.options.proxy).toBe('http://proxy');
  });

  test('should throw an error if the user-provided key has expired', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    process.env.AZURE_API_KEY = 'user_provided';
    process.env.DEBUG_OPENAI = 'false';
    process.env.OPENAI_SUMMARIZE = 'false';

    const expiresAt = new Date(Date.now() - 10000).toISOString(); // Expired
    const req = {
      body: { key: expiresAt, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
  });

  test('should throw an error if no API keys are provided in the environment', async () => {
    // Clear the environment variables for API keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;

    const req = {
      body: { key: null, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      'API key not provided.',
    );
  });

  it('should handle user-provided keys and check expiry', async () => {
    // Set up the req.body to simulate user-provided key scenario
    const req = {
      body: {
        key: new Date(Date.now() + 10000).toISOString(),
        endpoint: 'openAI',
      },
      user: {
        id: '123',
      },
    };

    const res = {};
    const endpointOption = {};

    // Ensure the environment variable is set to 'user_provided' to match the isUserProvided condition
    process.env.OPENAI_API_KEY = 'user_provided';

    // Mock getUserKey to return the expected key
    getUserKey.mockResolvedValue('test-user-provided-openai-api-key');

    // Call the initializeClient function
    const result = await initializeClient({ req, res, endpointOption });

    // Assertions
    expect(result.openAIApiKey).toBe('test-user-provided-openai-api-key');
  });

  test('should throw an error if the user-provided key is invalid', async () => {
    const invalidKey = new Date(Date.now() - 100000).toISOString();
    const req = {
      body: { key: invalidKey, endpoint: 'openAI' },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = {};

    // Ensure the environment variable is set to 'user_provided' to match the isUserProvided condition
    process.env.OPENAI_API_KEY = 'user_provided';

    // Mock getUserKey to return an invalid key
    getUserKey.mockResolvedValue(invalidKey);

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Your OpenAI API key has expired/,
    );
  });
});
