const { fetchModels } = require('~/server/services/ModelService');
const { getCustomConfig } = require('./getCustomConfig');
const loadConfigModels = require('./loadConfigModels');

jest.mock('~/server/services/ModelService');
jest.mock('./getCustomConfig');

const exampleConfig = {
  endpoints: {
    custom: [
      {
        name: 'Mistral',
        apiKey: '${MY_PRECIOUS_MISTRAL_KEY}',
        baseURL: 'https://api.mistral.ai/v1',
        models: {
          default: ['mistral-tiny', 'mistral-small', 'mistral-medium', 'mistral-large-latest'],
          fetch: true,
        },
        dropParams: ['stop', 'user', 'frequency_penalty', 'presence_penalty'],
      },
      {
        name: 'OpenRouter',
        apiKey: '${MY_OPENROUTER_API_KEY}',
        baseURL: 'https://openrouter.ai/api/v1',
        models: {
          default: ['gpt-3.5-turbo'],
          fetch: true,
        },
        dropParams: ['stop'],
      },
      {
        name: 'Novita',
        apiKey: '${MY_NOVITA_API_KEY}',
        baseURL: 'https://api.novita.ai/v3',
        models: {
          default: ['gpt-3.5-turbo'],
          fetch: true,
        },
        dropParams: ['stop'],
      },
      {
        name: 'groq',
        apiKey: 'user_provided',
        baseURL: 'https://api.groq.com/openai/v1/',
        models: {
          default: ['llama2-70b-4096', 'mixtral-8x7b-32768'],
          fetch: false,
        },
      },
      {
        name: 'Ollama',
        apiKey: 'user_provided',
        baseURL: 'http://localhost:11434/v1/',
        models: {
          default: ['mistral', 'llama2:13b'],
          fetch: false,
        },
      },
      {
        name: 'MLX',
        apiKey: 'user_provided',
        baseURL: 'http://localhost:8080/v1/',
        models: {
          default: ['Meta-Llama-3-8B-Instruct-4bit'],
          fetch: false,
        },
      },
    ],
  },
};

describe('loadConfigModels', () => {
  const mockRequest = { app: { locals: {} }, user: { id: 'testUserId' } };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return an empty object if customConfig is null', async () => {
    getCustomConfig.mockResolvedValue(null);
    const result = await loadConfigModels(mockRequest);
    expect(result).toEqual({});
  });

  it('handles azure models and endpoint correctly', async () => {
    mockRequest.app.locals.azureOpenAI = { modelNames: ['model1', 'model2'] };
    getCustomConfig.mockResolvedValue({
      endpoints: {
        azureOpenAI: {
          models: ['model1', 'model2'],
        },
      },
    });

    const result = await loadConfigModels(mockRequest);
    expect(result.azureOpenAI).toEqual(['model1', 'model2']);
  });

  it('fetches custom models based on the unique key', async () => {
    process.env.BASE_URL = 'http://example.com';
    process.env.API_KEY = 'some-api-key';
    const customEndpoints = {
      custom: [
        {
          baseURL: '${BASE_URL}',
          apiKey: '${API_KEY}',
          name: 'CustomModel',
          models: { fetch: true },
        },
      ],
    };

    getCustomConfig.mockResolvedValue({ endpoints: customEndpoints });
    fetchModels.mockResolvedValue(['customModel1', 'customModel2']);

    const result = await loadConfigModels(mockRequest);
    expect(fetchModels).toHaveBeenCalled();
    expect(result.CustomModel).toEqual(['customModel1', 'customModel2']);
  });

  it('correctly associates models to names using unique keys', async () => {
    getCustomConfig.mockResolvedValue({
      endpoints: {
        custom: [
          {
            baseURL: 'http://example.com',
            apiKey: 'API_KEY1',
            name: 'Model1',
            models: { fetch: true },
          },
          {
            baseURL: 'http://example.com',
            apiKey: 'API_KEY2',
            name: 'Model2',
            models: { fetch: true },
          },
        ],
      },
    });
    fetchModels.mockImplementation(({ apiKey }) =>
      Promise.resolve(apiKey === 'API_KEY1' ? ['model1Data'] : ['model2Data']),
    );

    const result = await loadConfigModels(mockRequest);
    expect(result.Model1).toEqual(['model1Data']);
    expect(result.Model2).toEqual(['model2Data']);
  });

  it('correctly handles multiple endpoints with the same baseURL but different apiKeys', async () => {
    // Mock the custom configuration to simulate the user's scenario
    getCustomConfig.mockResolvedValue({
      endpoints: {
        custom: [
          {
            name: 'LiteLLM',
            apiKey: '${LITELLM_ALL_MODELS}',
            baseURL: '${LITELLM_HOST}',
            models: { fetch: true },
          },
          {
            name: 'OpenAI',
            apiKey: '${LITELLM_OPENAI_MODELS}',
            baseURL: '${LITELLM_SECOND_HOST}',
            models: { fetch: true },
          },
          {
            name: 'Google',
            apiKey: '${LITELLM_GOOGLE_MODELS}',
            baseURL: '${LITELLM_SECOND_HOST}',
            models: { fetch: true },
          },
        ],
      },
    });

    // Mock `fetchModels` to return different models based on the apiKey
    fetchModels.mockImplementation(({ apiKey }) => {
      switch (apiKey) {
        case '${LITELLM_ALL_MODELS}':
          return Promise.resolve(['AllModel1', 'AllModel2']);
        case '${LITELLM_OPENAI_MODELS}':
          return Promise.resolve(['OpenAIModel']);
        case '${LITELLM_GOOGLE_MODELS}':
          return Promise.resolve(['GoogleModel']);
        default:
          return Promise.resolve([]);
      }
    });

    const result = await loadConfigModels(mockRequest);

    // Assert that the models are correctly fetched and mapped based on unique keys
    expect(result.LiteLLM).toEqual(['AllModel1', 'AllModel2']);
    expect(result.OpenAI).toEqual(['OpenAIModel']);
    expect(result.Google).toEqual(['GoogleModel']);

    // Ensure that fetchModels was called with correct parameters
    expect(fetchModels).toHaveBeenCalledTimes(3);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '${LITELLM_ALL_MODELS}' }),
    );
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '${LITELLM_OPENAI_MODELS}' }),
    );
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '${LITELLM_GOOGLE_MODELS}' }),
    );
  });

  it('loads models based on custom endpoint configuration respecting fetch rules', async () => {
    process.env.MY_PRECIOUS_MISTRAL_KEY = 'actual_mistral_api_key';
    process.env.MY_OPENROUTER_API_KEY = 'actual_openrouter_api_key';
    process.env.MY_NOVITA_API_KEY = 'actual_novita_api_key';
    // Setup custom configuration with specific API keys for Mistral, OpenRouter and Novita
    // and "user_provided" for groq and Ollama, indicating no fetch for the latter two
    getCustomConfig.mockResolvedValue(exampleConfig);

    // Assuming fetchModels would be called only for Mistral, OpenRouter and Novita
    fetchModels.mockImplementation(({ name }) => {
      switch (name) {
        case 'Mistral':
          return Promise.resolve([
            'mistral-tiny',
            'mistral-small',
            'mistral-medium',
            'mistral-large-latest',
          ]);
        case 'OpenRouter':
          return Promise.resolve(['gpt-3.5-turbo']);
        case 'Novita':
          return Promise.resolve(['llama-3-70b-instruct']);
        default:
          return Promise.resolve([]);
      }
    });

    const result = await loadConfigModels(mockRequest);

    // Since fetch is true and apiKey is not "user_provided", fetching occurs for Mistral, OpenRouter and Novita
    expect(result.Mistral).toEqual([
      'mistral-tiny',
      'mistral-small',
      'mistral-medium',
      'mistral-large-latest',
    ]);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mistral',
        apiKey: process.env.MY_PRECIOUS_MISTRAL_KEY,
      }),
    );

    expect(result.OpenRouter).toEqual(['gpt-3.5-turbo']);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OpenRouter',
        apiKey: process.env.MY_OPENROUTER_API_KEY,
      }),
    );

    expect(result.Novita).toEqual(['llama-3-70b-instruct']);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Novita',
        apiKey: process.env.MY_NOVITA_API_KEY,
      }),
    );

    // For groq and ollama, since the apiKey is "user_provided", models should not be fetched
    // Depending on your implementation's behavior regarding "default" models without fetching,
    // you may need to adjust the following assertions:
    expect(result.groq).toBe(exampleConfig.endpoints.custom[2].models.default);
    expect(result.ollama).toBe(exampleConfig.endpoints.custom[3].models.default);

    // Verifying fetchModels was not called for groq and ollama
    expect(fetchModels).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'groq',
      }),
    );
    expect(fetchModels).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ollama',
      }),
    );
  });

  it('falls back to default models if fetching returns an empty array', async () => {
    getCustomConfig.mockResolvedValue({
      endpoints: {
        custom: [
          {
            name: 'EndpointWithSameFetchKey',
            apiKey: 'API_KEY',
            baseURL: 'http://example.com',
            models: {
              fetch: true,
              default: ['defaultModel1'],
            },
          },
          {
            name: 'EmptyFetchModel',
            apiKey: 'API_KEY',
            baseURL: 'http://example.com',
            models: {
              fetch: true,
              default: ['defaultModel1', 'defaultModel2'],
            },
          },
        ],
      },
    });

    fetchModels.mockResolvedValue([]);

    const result = await loadConfigModels(mockRequest);
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(result.EmptyFetchModel).toEqual(['defaultModel1', 'defaultModel2']);
  });

  it('falls back to default models if fetching returns a falsy value', async () => {
    getCustomConfig.mockResolvedValue({
      endpoints: {
        custom: [
          {
            name: 'FalsyFetchModel',
            apiKey: 'API_KEY',
            baseURL: 'http://example.com',
            models: {
              fetch: true,
              default: ['defaultModel1', 'defaultModel2'],
            },
          },
        ],
      },
    });

    fetchModels.mockResolvedValue(false);

    const result = await loadConfigModels(mockRequest);

    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'FalsyFetchModel',
        apiKey: 'API_KEY',
      }),
    );

    expect(result.FalsyFetchModel).toEqual(['defaultModel1', 'defaultModel2']);
  });

  it('normalizes Ollama endpoint name to lowercase', async () => {
    const testCases = [
      {
        name: 'Ollama',
        apiKey: 'user_provided',
        baseURL: 'http://localhost:11434/v1/',
        models: {
          default: ['mistral', 'llama2'],
          fetch: false,
        },
      },
      {
        name: 'OLLAMA',
        apiKey: 'user_provided',
        baseURL: 'http://localhost:11434/v1/',
        models: {
          default: ['mixtral', 'codellama'],
          fetch: false,
        },
      },
      {
        name: 'OLLaMA',
        apiKey: 'user_provided',
        baseURL: 'http://localhost:11434/v1/',
        models: {
          default: ['phi', 'neural-chat'],
          fetch: false,
        },
      },
    ];

    getCustomConfig.mockResolvedValue({
      endpoints: {
        custom: testCases,
      },
    });

    const result = await loadConfigModels(mockRequest);

    // All variations of "Ollama" should be normalized to lowercase "ollama"
    // and the last config in the array should override previous ones
    expect(result.Ollama).toBeUndefined();
    expect(result.OLLAMA).toBeUndefined();
    expect(result.OLLaMA).toBeUndefined();
    expect(result.ollama).toEqual(['phi', 'neural-chat']);

    // Verify fetchModels was not called since these are user_provided
    expect(fetchModels).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ollama',
      }),
    );
    expect(fetchModels).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OLLAMA',
      }),
    );
    expect(fetchModels).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OLLaMA',
      }),
    );
  });
});
