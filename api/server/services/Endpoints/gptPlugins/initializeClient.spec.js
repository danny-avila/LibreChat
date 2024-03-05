// gptPlugins/initializeClient.spec.js
const { EModelEndpoint, validateAzureGroups } = require('librechat-data-provider');
const { getUserKey } = require('~/server/services/UserService');
const initializeClient = require('./initializeClient');
const { PluginsClient } = require('~/app');

// Mock getUserKey since it's the only function we want to mock
jest.mock('~/server/services/UserService', () => ({
  getUserKey: jest.fn(),
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
}));

describe('gptPlugins/initializeClient', () => {
  // Set up environment variables
  const originalEnvironment = process.env;
  const app = {
    locals: {},
  };

  const validAzureConfigs = [
    {
      group: 'librechat-westus',
      apiKey: 'WESTUS_API_KEY',
      instanceName: 'librechat-westus',
      version: '2023-12-01-preview',
      models: {
        'gpt-4-vision-preview': {
          deploymentName: 'gpt-4-vision-preview',
          version: '2024-02-15-preview',
        },
        'gpt-3.5-turbo': {
          deploymentName: 'gpt-35-turbo',
        },
        'gpt-3.5-turbo-1106': {
          deploymentName: 'gpt-35-turbo-1106',
        },
        'gpt-4': {
          deploymentName: 'gpt-4',
        },
        'gpt-4-1106-preview': {
          deploymentName: 'gpt-4-1106-preview',
        },
      },
    },
    {
      group: 'librechat-eastus',
      apiKey: 'EASTUS_API_KEY',
      instanceName: 'librechat-eastus',
      deploymentName: 'gpt-4-turbo',
      version: '2024-02-15-preview',
      models: {
        'gpt-4-turbo': true,
      },
      baseURL: 'https://eastus.example.com',
      additionalHeaders: {
        'x-api-key': 'x-api-key-value',
      },
    },
    {
      group: 'mistral-inference',
      apiKey: 'AZURE_MISTRAL_API_KEY',
      baseURL:
        'https://Mistral-large-vnpet-serverless.region.inference.ai.azure.com/v1/chat/completions',
      serverless: true,
      models: {
        'mistral-large': true,
      },
    },
    {
      group: 'llama-70b-chat',
      apiKey: 'AZURE_LLAMA2_70B_API_KEY',
      baseURL:
        'https://Llama-2-70b-chat-qmvyb-serverless.region.inference.ai.azure.com/v1/chat/completions',
      serverless: true,
      models: {
        'llama-70b-chat': true,
      },
    },
  ];

  const { modelNames, modelGroupMap, groupMap } = validateAzureGroups(validAzureConfigs);

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
      app,
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
      app,
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
      app,
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
      app,
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
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      `${EModelEndpoint.openAI} API key not provided.`,
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
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    getUserKey.mockResolvedValue(JSON.stringify({ apiKey: 'test-user-provided-openai-api-key' }));

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
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'test-model' } };

    getUserKey.mockResolvedValue(
      JSON.stringify({
        apiKey: JSON.stringify({
          azureOpenAIApiKey: 'test-user-provided-azure-api-key',
          azureOpenAIApiDeploymentName: 'test-deployment',
        }),
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
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(/Your OpenAI API/);
  });

  test('should throw an error if the user-provided Azure key is invalid JSON', async () => {
    process.env.AZURE_API_KEY = 'user_provided';
    process.env.PLUGINS_USE_AZURE = 'true';

    const req = {
      body: { key: new Date(Date.now() + 10000).toISOString() },
      user: { id: '123' },
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    // Simulate an invalid JSON string returned from getUserKey
    getUserKey.mockResolvedValue('invalid-json');

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Invalid JSON provided/,
    );
  });

  test('should correctly handle the presence of a reverse proxy', async () => {
    process.env.OPENAI_REVERSE_PROXY = 'http://reverse.proxy';
    process.env.PROXY = 'http://proxy';
    process.env.OPENAI_API_KEY = 'test-openai-api-key';

    const req = {
      body: { key: null },
      user: { id: '123' },
      app,
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client } = await initializeClient({ req, res, endpointOption });

    expect(client.options.reverseProxyUrl).toBe('http://reverse.proxy');
    expect(client.options.proxy).toBe('http://proxy');
  });

  test('should throw an error when user-provided values are not valid JSON', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    const req = {
      body: { key: new Date(Date.now() + 10000).toISOString(), endpoint: 'openAI' },
      user: { id: '123' },
      app,
    };
    const res = {};
    const endpointOption = {};

    // Mock getUserKey to return a non-JSON string
    getUserKey.mockResolvedValue('not-a-json');

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Invalid JSON provided for openAI user values/,
    );
  });

  test('should initialize client correctly for Azure OpenAI with valid configuration', async () => {
    const req = {
      body: {
        key: null,
        endpoint: EModelEndpoint.gptPlugins,
        model: modelNames[0],
      },
      user: { id: '123' },
      app: {
        locals: {
          [EModelEndpoint.azureOpenAI]: {
            plugins: true,
            modelNames,
            modelGroupMap,
            groupMap,
          },
        },
      },
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });
    expect(client.client.options.azure).toBeDefined();
  });

  test('should initialize client with default options when certain env vars are not set', async () => {
    delete process.env.DEBUG_OPENAI;
    delete process.env.OPENAI_SUMMARIZE;
    process.env.OPENAI_API_KEY = 'some-api-key';

    const req = {
      body: { key: null, endpoint: EModelEndpoint.gptPlugins },
      user: { id: '123' },
      app,
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.client.options.debug).toBe(false);
    expect(client.client.options.contextStrategy).toBe(null);
  });

  test('should correctly use user-provided apiKey and baseURL when provided', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    process.env.OPENAI_REVERSE_PROXY = 'user_provided';
    const req = {
      body: {
        key: new Date(Date.now() + 10000).toISOString(),
        endpoint: 'openAI',
      },
      user: {
        id: '123',
      },
      app,
    };
    const res = {};
    const endpointOption = {};

    getUserKey.mockResolvedValue(
      JSON.stringify({ apiKey: 'test', baseURL: 'https://user-provided-url.com' }),
    );

    const result = await initializeClient({ req, res, endpointOption });

    expect(result.openAIApiKey).toBe('test');
    expect(result.client.options.reverseProxyUrl).toBe('https://user-provided-url.com');
  });
});
