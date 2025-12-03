jest.mock('~/cache/getLogStores', () => ({
  getLogStores: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue({
      openAI: { apiKey: 'test-key' },
    }),
    set: jest.fn(),
    delete: jest.fn(),
  }),
}));

const { EModelEndpoint, ErrorTypes, validateAzureGroups } = require('librechat-data-provider');
const { getUserKey, getUserKeyValues } = require('~/server/services/UserService');
const initializeClient = require('./initialize');
const { OpenAIClient } = require('~/app');

// Mock getUserKey since it's the only function we want to mock
jest.mock('~/server/services/UserService', () => ({
  getUserKey: jest.fn(),
  getUserKeyValues: jest.fn(),
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
}));

const mockAppConfig = {
  endpoints: {
    openAI: {
      apiKey: 'test-key',
    },
    azureOpenAI: {
      apiKey: 'test-azure-key',
      modelNames: ['gpt-4-vision-preview', 'gpt-3.5-turbo', 'gpt-4'],
      modelGroupMap: {
        'gpt-4-vision-preview': {
          group: 'librechat-westus',
          deploymentName: 'gpt-4-vision-preview',
          version: '2024-02-15-preview',
        },
      },
      groupMap: {
        'librechat-westus': {
          apiKey: 'WESTUS_API_KEY',
          instanceName: 'librechat-westus',
          version: '2023-12-01-preview',
          models: {
            'gpt-4-vision-preview': {
              deploymentName: 'gpt-4-vision-preview',
              version: '2024-02-15-preview',
            },
          },
        },
      },
    },
  },
};

describe('initializeClient', () => {
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

  const { modelNames } = validateAzureGroups(validAzureConfigs);

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
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    const result = await initializeClient({ req, res, endpointOption });

    expect(result.openAIApiKey).toBe('test-openai-api-key');
    expect(result.client).toBeInstanceOf(OpenAIClient);
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
      body: {
        key: null,
        endpoint: 'azureOpenAI',
        model: 'gpt-4-vision-preview',
      },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    const client = await initializeClient({ req, res, endpointOption });

    expect(client.openAIApiKey).toBe('WESTUS_API_KEY');
    expect(client.client).toBeInstanceOf(OpenAIClient);
  });

  test('should use the debug option when DEBUG_OPENAI is enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key';
    process.env.DEBUG_OPENAI = 'true';

    const req = {
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
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
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
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
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
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
      body: { key: expiresAt, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /expired_user_key/,
    );
  });

  test('should throw an error if no API keys are provided in the environment', async () => {
    // Clear the environment variables for API keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;

    const req = {
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      `${EModelEndpoint.openAI} API Key not provided.`,
    );
  });

  it('should handle user-provided keys and check expiry', async () => {
    // Set up the req.body to simulate user-provided key scenario
    const req = {
      body: {
        key: new Date(Date.now() + 10000).toISOString(),
        endpoint: EModelEndpoint.openAI,
      },
      user: {
        id: '123',
      },
      app,
      config: mockAppConfig,
    };

    const res = {};
    const endpointOption = {};

    // Ensure the environment variable is set to 'user_provided' to match the isUserProvided condition
    process.env.OPENAI_API_KEY = 'user_provided';

    // Mock getUserKey to return the expected key
    getUserKeyValues.mockResolvedValue({ apiKey: 'test-user-provided-openai-api-key' });

    // Call the initializeClient function
    const result = await initializeClient({ req, res, endpointOption });

    // Assertions
    expect(result.openAIApiKey).toBe('test-user-provided-openai-api-key');
  });

  test('should throw an error if the user-provided key is invalid', async () => {
    const invalidKey = new Date(Date.now() - 100000).toISOString();
    const req = {
      body: { key: invalidKey, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    // Ensure the environment variable is set to 'user_provided' to match the isUserProvided condition
    process.env.OPENAI_API_KEY = 'user_provided';

    // Mock getUserKey to return an invalid key
    getUserKey.mockResolvedValue(invalidKey);

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /expired_user_key/,
    );
  });

  test('should throw an error when user-provided values are not valid JSON', async () => {
    process.env.OPENAI_API_KEY = 'user_provided';
    const req = {
      body: { key: new Date(Date.now() + 10000).toISOString(), endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    // Mock getUserKey to return a non-JSON string
    getUserKey.mockResolvedValue('not-a-json');
    getUserKeyValues.mockImplementation(() => {
      let userValues = getUserKey();
      try {
        userValues = JSON.parse(userValues);
      } catch {
        throw new Error(
          JSON.stringify({
            type: ErrorTypes.INVALID_USER_KEY,
          }),
        );
      }
      return userValues;
    });

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /invalid_user_key/,
    );
  });

  test('should initialize client correctly for Azure OpenAI with valid configuration', async () => {
    // Set up Azure environment variables
    process.env.WESTUS_API_KEY = 'test-westus-key';

    const req = {
      body: {
        key: null,
        endpoint: EModelEndpoint.azureOpenAI,
        model: modelNames[0],
      },
      user: { id: '123' },
      config: mockAppConfig,
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
      body: { key: null, endpoint: EModelEndpoint.openAI },
      user: { id: '123' },
      app,
      config: mockAppConfig,
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
        endpoint: EModelEndpoint.openAI,
      },
      user: {
        id: '123',
      },
      app,
      config: mockAppConfig,
    };
    const res = {};
    const endpointOption = {};

    getUserKeyValues.mockResolvedValue({
      apiKey: 'test',
      baseURL: 'https://user-provided-url.com',
    });

    const result = await initializeClient({ req, res, endpointOption });

    expect(result.openAIApiKey).toBe('test');
    expect(result.client.options.reverseProxyUrl).toBe('https://user-provided-url.com');
  });
});
