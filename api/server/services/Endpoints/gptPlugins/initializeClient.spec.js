// gptPlugins/initializeClient.spec.js
const { PluginsClient } = require('~/app');
const initializeClient = require('./initializeClient');
const { getUserKey } = require('../../UserService');

// Mock getUserKey since it's the only function we want to mock
jest.mock('~/server/services/UserService', () => ({
  getUserKey: jest.fn(),
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
}));

describe('gptPlugins/initializeClient', () => {
  // Set up environment variables
  const originalEnvironment = process.env;

  beforeEach(() => {
    jest.resetModules(); // Clears the cache
    process.env = { ...originalEnvironment }; // Make a copy
  });

  afterAll(() => {
    process.env = originalEnvironment; // Restore original env vars
  });

  test('should initialize PluginsClient with OpenAI API key and default options', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.PLUGINS_USE_AZURE = 'false';
    process.env.DEBUG_PLUGINS = 'false';
    process.env.OPENAI_SUMMARIZE = 'false';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client, openAIApiKey } = await initializeClient({ req, res, endpointOption });

    expect(openAIApiKey).toBe('test-openai-api-key');
    expect(client).toBeInstanceOf(PluginsClient);
  });

  test('should initialize PluginsClient with Azure credentials when PLUGINS_USE_AZURE is true', async () => {
    process.env.AZURE_API_KEY = 'test-azure-api-key';
    (process.env.AZURE_OPENAI_API_INSTANCE_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_VERSION = 'some-value'),
    (process.env.AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME = 'some-value'),
    (process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME = 'some-value'),
    (process.env.PLUGINS_USE_AZURE = 'true');
    process.env.DEBUG_PLUGINS = 'false';
    process.env.OPENAI_SUMMARIZE = 'false';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'test-model' } };

    const { client, azure } = await initializeClient({ req, res, endpointOption });

    expect(azure.azureOpenAIApiKey).toBe('test-azure-api-key');
    expect(client).toBeInstanceOf(PluginsClient);
  });

  test('should use the debug option when DEBUG_PLUGINS is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.DEBUG_PLUGINS = 'true';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client } = await initializeClient({ req, res, endpointOption });

    expect(client.options.debug).toBe(true);
  });

  test('should set contextStrategy to summarize when OPENAI_SUMMARIZE is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.OPENAI_SUMMARIZE = 'true';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client } = await initializeClient({ req, res, endpointOption });

    expect(client.options.contextStrategy).toBe('summarize');
  });

  // ... additional tests for reverseProxyUrl, proxy, user-provided keys, etc.

  test('should throw an error if no API keys are provided in the environment', async () => {
    // Clear the environment variables for API keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      'API key not provided.',
    );
  });

  // Additional tests for gptPlugins/initializeClient.spec.js

  // ... (previous test setup code)

  test('should handle user-provided OpenAI keys and check expiry', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    process.env.PLUGINS_USE_AZURE = 'false';

    const futureDate = new Date(Date.now() + 10000).toISOString();
    const req = {
      body: { key: futureDate },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    getUserKey.mockResolvedValue('test-user-provided-openai-api-key');

    const { openAIApiKey } = await initializeClient({ req, res, endpointOption });

    expect(openAIApiKey).toBe('test-user-provided-openai-api-key');
  });

  test('should handle user-provided Azure keys and check expiry', async () => {
    process.env.AZURE_API_KEY = 'user_provided';
    process.env.PLUGINS_USE_AZURE = 'true';

    const futureDate = new Date(Date.now() + 10000).toISOString();
    const req = {
      body: { key: futureDate },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'test-model' } };

    getUserKey.mockResolvedValue(
      JSON.stringify({
        azureOpenAIApiKey: 'test-user-provided-azure-api-key',
        azureOpenAIApiDeploymentName: 'test-deployment',
      }),
    );

    const { azure } = await initializeClient({ req, res, endpointOption });

    expect(azure.azureOpenAIApiKey).toBe('test-user-provided-azure-api-key');
  });

  test('should throw an error if the user-provided key has expired', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    process.env.PLUGINS_USE_AZURE = 'FALSE';
    const expiresAt = new Date(Date.now() - 10000).toISOString(); // Expired
    const req = {
      body: { key: expiresAt },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Your OpenAI API key has expired/,
    );
  });

  test('should throw an error if the user-provided Azure key is invalid JSON', async () => {
    process.env.AZURE_API_KEY = 'user_provided';
    process.env.PLUGINS_USE_AZURE = 'true';

    const req = {
      body: { key: new Date(Date.now() + 10000).toISOString() },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    // Simulate an invalid JSON string returned from getUserKey
    getUserKey.mockResolvedValue('invalid-json');

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Unexpected token/,
    );
  });

  test('should correctly handle the presence of a reverse proxy', async () => {
    process.env.OPENAI_REVERSE_PROXY = 'http://reverse.proxy';
    process.env.PROXY = 'http://proxy';
    process.env.OPENAI_API_KEY = 'test-openai-api-key';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client } = await initializeClient({ req, res, endpointOption });

    expect(client.options.reverseProxyUrl).toBe('http://reverse.proxy');
    expect(client.options.proxy).toBe('http://proxy');
  });
});
