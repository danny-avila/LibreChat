const axios = require('axios');
const { logAxiosError, resolveHeaders } = require('@librechat/api');
const { EModelEndpoint, defaultModels } = require('librechat-data-provider');

const {
  fetchModels,
  splitAndTrim,
  getOpenAIModels,
  getGoogleModels,
  getBedrockModels,
  getAnthropicModels,
} = require('./ModelService');

jest.mock('@librechat/api', () => {
  const originalUtils = jest.requireActual('@librechat/api');
  return {
    ...originalUtils,
    processModelData: jest.fn((...args) => {
      return originalUtils.processModelData(...args);
    }),
    logAxiosError: jest.fn(),
    resolveHeaders: jest.fn((options) => options?.headers || {}),
  };
});

jest.mock('axios');
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(true),
  })),
);
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
  },
}));
jest.mock('./Config/EndpointService', () => ({
  config: {
    openAIApiKey: 'mockedApiKey',
    userProvidedOpenAI: false,
  },
}));

axios.get.mockResolvedValue({
  data: {
    data: [{ id: 'model-1' }, { id: 'model-2' }],
  },
});

describe('fetchModels', () => {
  it('fetches models successfully from the API', async () => {
    const models = await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      name: 'TestAPI',
    });

    expect(models).toEqual(['model-1', 'model-2']);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.test.com/models'),
      expect.any(Object),
    );
  });

  it('adds the user ID to the models query when option and ID are passed', async () => {
    const models = await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      userIdQuery: true,
      name: 'TestAPI',
    });

    expect(models).toEqual(['model-1', 'model-2']);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.test.com/models?user=user123'),
      expect.any(Object),
    );
  });

  it('should pass custom headers to the API request', async () => {
    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      'X-API-Version': 'v2',
    };

    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      name: 'TestAPI',
      headers: customHeaders,
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.test.com/models'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'custom-value',
          'X-API-Version': 'v2',
          Authorization: 'Bearer testApiKey',
        }),
      }),
    );
  });

  it('should handle null headers gracefully', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      name: 'TestAPI',
      headers: null,
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.test.com/models'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer testApiKey',
        }),
      }),
    );
  });

  it('should handle undefined headers gracefully', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      name: 'TestAPI',
      headers: undefined,
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://api.test.com/models'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer testApiKey',
        }),
      }),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});

describe('fetchModels with createTokenConfig true', () => {
  const data = {
    data: [
      {
        id: 'model-1',
        pricing: {
          prompt: '0.002',
          completion: '0.001',
        },
        context_length: 1024,
      },
      {
        id: 'model-2',
        pricing: {
          prompt: '0.003',
          completion: '0.0015',
        },
        context_length: 2048,
      },
    ],
  };

  beforeEach(() => {
    // Clears the mock's history before each test
    const _utils = require('@librechat/api');
    axios.get.mockResolvedValue({ data });
  });

  it('creates and stores token configuration if createTokenConfig is true', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      createTokenConfig: true,
    });

    const { processModelData } = require('@librechat/api');
    expect(processModelData).toHaveBeenCalled();
    expect(processModelData).toHaveBeenCalledWith(data);
  });
});

describe('getOpenAIModels', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    axios.get.mockRejectedValue(new Error('Network error'));
  });

  afterEach(() => {
    process.env = originalEnv;
    axios.get.mockReset();
  });

  it('returns default models when no environment configurations are provided (and fetch fails)', async () => {
    const models = await getOpenAIModels({ user: 'user456' });
    expect(models).toContain('gpt-4');
  });

  it('returns `AZURE_OPENAI_MODELS` with `azure` flag (and fetch fails)', async () => {
    process.env.AZURE_OPENAI_MODELS = 'azure-model,azure-model-2';
    const models = await getOpenAIModels({ azure: true });
    expect(models).toEqual(expect.arrayContaining(['azure-model', 'azure-model-2']));
  });

  it('returns `PLUGIN_MODELS` with `plugins` flag (and fetch fails)', async () => {
    process.env.PLUGIN_MODELS = 'plugins-model,plugins-model-2';
    const models = await getOpenAIModels({ plugins: true });
    expect(models).toEqual(expect.arrayContaining(['plugins-model', 'plugins-model-2']));
  });

  it('returns `OPENAI_MODELS` with no flags (and fetch fails)', async () => {
    process.env.OPENAI_MODELS = 'openai-model,openai-model-2';
    const models = await getOpenAIModels({});
    expect(models).toEqual(expect.arrayContaining(['openai-model', 'openai-model-2']));
  });

  it('utilizes proxy configuration when PROXY is set', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [],
      },
    });
    process.env.PROXY = 'http://localhost:8888';
    await getOpenAIModels({ user: 'user456' });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        httpsAgent: expect.anything(),
      }),
    );
  });
});

describe('getOpenAIModels with mocked config', () => {
  it('uses alternative behavior when userProvidedOpenAI is true', async () => {
    jest.mock('./Config/EndpointService', () => ({
      config: {
        openAIApiKey: 'mockedApiKey',
        userProvidedOpenAI: true,
      },
    }));
    jest.mock('librechat-data-provider', () => {
      const original = jest.requireActual('librechat-data-provider');
      return {
        ...original,
        defaultModels: {
          [original.EModelEndpoint.openAI]: ['some-default-model'],
        },
      };
    });

    jest.resetModules();
    const { getOpenAIModels } = require('./ModelService');

    const models = await getOpenAIModels({ user: 'user456' });
    expect(models).toContain('some-default-model');
  });
});

describe('getOpenAIModels sorting behavior', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
      data: {
        data: [
          { id: 'gpt-3.5-turbo-instruct-0914' },
          { id: 'gpt-3.5-turbo-instruct' },
          { id: 'gpt-3.5-turbo' },
          { id: 'gpt-4-0314' },
          { id: 'gpt-4-turbo-preview' },
        ],
      },
    });
  });

  it('ensures instruct models are listed last', async () => {
    const models = await getOpenAIModels({ user: 'user456' });

    // Check if the last model is an "instruct" model
    expect(models[models.length - 1]).toMatch(/instruct/);

    // Check if the "instruct" models are placed at the end
    const instructIndexes = models
      .map((model, index) => (model.includes('instruct') ? index : -1))
      .filter((index) => index !== -1);
    const nonInstructIndexes = models
      .map((model, index) => (!model.includes('instruct') ? index : -1))
      .filter((index) => index !== -1);

    expect(Math.max(...nonInstructIndexes)).toBeLessThan(Math.min(...instructIndexes));

    const expectedOrder = [
      'gpt-3.5-turbo',
      'gpt-4-0314',
      'gpt-4-turbo-preview',
      'gpt-3.5-turbo-instruct-0914',
      'gpt-3.5-turbo-instruct',
    ];
    expect(models).toEqual(expectedOrder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});

describe('fetchModels with Ollama specific logic', () => {
  const mockOllamaData = {
    data: {
      models: [{ name: 'Ollama-Base' }, { name: 'Ollama-Advanced' }],
    },
  };

  beforeEach(() => {
    axios.get.mockResolvedValue(mockOllamaData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch Ollama models when name starts with "ollama"', async () => {
    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      baseURL: 'https://api.ollama.test.com',
      name: 'OllamaAPI',
    });

    expect(models).toEqual(['Ollama-Base', 'Ollama-Advanced']);
    expect(axios.get).toHaveBeenCalledWith('https://api.ollama.test.com/api/tags', {
      headers: {},
      timeout: 5000,
    });
  });

  it('should pass headers and user object to Ollama fetchModels', async () => {
    const customHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer custom-token',
    };
    const userObject = {
      id: 'user789',
      email: 'test@example.com',
    };

    resolveHeaders.mockReturnValueOnce(customHeaders);

    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      baseURL: 'https://api.ollama.test.com',
      name: 'ollama',
      headers: customHeaders,
      userObject,
    });

    expect(models).toEqual(['Ollama-Base', 'Ollama-Advanced']);
    expect(resolveHeaders).toHaveBeenCalledWith({
      headers: customHeaders,
      user: userObject,
    });
    expect(axios.get).toHaveBeenCalledWith('https://api.ollama.test.com/api/tags', {
      headers: customHeaders,
      timeout: 5000,
    });
  });

  it('should handle errors gracefully when fetching Ollama models fails and fallback to OpenAI-compatible fetch', async () => {
    axios.get.mockRejectedValueOnce(new Error('Ollama API error'));
    axios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'fallback-model-1' }, { id: 'fallback-model-2' }],
      },
    });

    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      baseURL: 'https://api.ollama.test.com',
      name: 'OllamaAPI',
    });

    expect(models).toEqual(['fallback-model-1', 'fallback-model-2']);
    expect(logAxiosError).toHaveBeenCalledWith({
      message:
        'Failed to fetch models from Ollama API. Attempting to fetch via OpenAI-compatible endpoint.',
      error: expect.any(Error),
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('should return an empty array if no baseURL is provided', async () => {
    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      name: 'OllamaAPI',
    });
    expect(models).toEqual([]);
  });

  it('should not fetch Ollama models if the name does not start with "ollama"', async () => {
    // Mock axios to return a different set of models for non-Ollama API calls
    axios.get.mockResolvedValue({
      data: {
        data: [{ id: 'model-1' }, { id: 'model-2' }],
      },
    });

    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      name: 'TestAPI',
    });

    expect(models).toEqual(['model-1', 'model-2']);
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.test.com/models', // Ensure the correct API endpoint is called
      expect.any(Object), // Ensuring some object (headers, etc.) is passed
    );
  });
});

describe('fetchModels URL construction with trailing slashes', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
      data: {
        data: [{ id: 'model-1' }, { id: 'model-2' }],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not create double slashes when baseURL has a trailing slash', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com/v1/',
      name: 'TestAPI',
    });

    expect(axios.get).toHaveBeenCalledWith('https://api.test.com/v1/models', expect.any(Object));
  });

  it('should handle baseURL without trailing slash normally', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com/v1',
      name: 'TestAPI',
    });

    expect(axios.get).toHaveBeenCalledWith('https://api.test.com/v1/models', expect.any(Object));
  });

  it('should handle baseURL with multiple trailing slashes', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com/v1///',
      name: 'TestAPI',
    });

    expect(axios.get).toHaveBeenCalledWith('https://api.test.com/v1/models', expect.any(Object));
  });

  it('should correctly append query params after stripping trailing slashes', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com/v1/',
      name: 'TestAPI',
      userIdQuery: true,
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.test.com/v1/models?user=user123',
      expect.any(Object),
    );
  });
});

describe('splitAndTrim', () => {
  it('should split a string by commas and trim each value', () => {
    const input = ' model1, model2 , model3,model4 ';
    const expected = ['model1', 'model2', 'model3', 'model4'];
    expect(splitAndTrim(input)).toEqual(expected);
  });

  it('should return an empty array for empty input', () => {
    expect(splitAndTrim('')).toEqual([]);
  });

  it('should return an empty array for null input', () => {
    expect(splitAndTrim(null)).toEqual([]);
  });

  it('should return an empty array for undefined input', () => {
    expect(splitAndTrim(undefined)).toEqual([]);
  });

  it('should filter out empty values after trimming', () => {
    const input = 'model1,,  ,model2,';
    const expected = ['model1', 'model2'];
    expect(splitAndTrim(input)).toEqual(expected);
  });
});

describe('getAnthropicModels', () => {
  it('returns default models when ANTHROPIC_MODELS is not set', async () => {
    delete process.env.ANTHROPIC_MODELS;
    const models = await getAnthropicModels();
    expect(models).toEqual(defaultModels[EModelEndpoint.anthropic]);
  });

  it('returns models from ANTHROPIC_MODELS when set', async () => {
    process.env.ANTHROPIC_MODELS = 'claude-1, claude-2 ';
    const models = await getAnthropicModels();
    expect(models).toEqual(['claude-1', 'claude-2']);
  });

  it('should use Anthropic-specific headers when fetching models', async () => {
    delete process.env.ANTHROPIC_MODELS;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    axios.get.mockResolvedValue({
      data: {
        data: [{ id: 'claude-3' }, { id: 'claude-4' }],
      },
    });

    await fetchModels({
      user: 'user123',
      apiKey: 'test-anthropic-key',
      baseURL: 'https://api.anthropic.com/v1',
      name: EModelEndpoint.anthropic,
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': expect.any(String),
        },
      }),
    );
  });

  it('should pass custom headers for Anthropic endpoint', async () => {
    const customHeaders = {
      'X-Custom-Header': 'custom-value',
    };

    axios.get.mockResolvedValue({
      data: {
        data: [{ id: 'claude-3' }],
      },
    });

    await fetchModels({
      user: 'user123',
      apiKey: 'test-anthropic-key',
      baseURL: 'https://api.anthropic.com/v1',
      name: EModelEndpoint.anthropic,
      headers: customHeaders,
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': expect.any(String),
        },
      }),
    );
  });
});

describe('getGoogleModels', () => {
  it('returns default models when GOOGLE_MODELS is not set', () => {
    delete process.env.GOOGLE_MODELS;
    const models = getGoogleModels();
    expect(models).toEqual(defaultModels[EModelEndpoint.google]);
  });

  it('returns models from GOOGLE_MODELS when set', () => {
    process.env.GOOGLE_MODELS = 'gemini-pro, bard ';
    const models = getGoogleModels();
    expect(models).toEqual(['gemini-pro', 'bard']);
  });
});

describe('getBedrockModels', () => {
  it('returns default models when BEDROCK_AWS_MODELS is not set', () => {
    delete process.env.BEDROCK_AWS_MODELS;
    const models = getBedrockModels();
    expect(models).toEqual(defaultModels[EModelEndpoint.bedrock]);
  });

  it('returns models from BEDROCK_AWS_MODELS when set', () => {
    process.env.BEDROCK_AWS_MODELS = 'anthropic.claude-v2, ai21.j2-ultra ';
    const models = getBedrockModels();
    expect(models).toEqual(['anthropic.claude-v2', 'ai21.j2-ultra']);
  });
});
