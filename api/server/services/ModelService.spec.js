const axios = require('axios');
const { logger } = require('~/config');

const { fetchModels, getOpenAIModels } = require('./ModelService');
jest.mock('~/utils', () => {
  const originalUtils = jest.requireActual('~/utils');
  return {
    ...originalUtils,
    processModelData: jest.fn((...args) => {
      return originalUtils.processModelData(...args);
    }),
  };
});

jest.mock('axios');
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(true),
  })),
);
jest.mock('~/config', () => ({
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
    const _utils = require('~/utils');
    axios.get.mockResolvedValue({ data });
  });

  it('creates and stores token configuration if createTokenConfig is true', async () => {
    await fetchModels({
      user: 'user123',
      apiKey: 'testApiKey',
      baseURL: 'https://api.test.com',
      createTokenConfig: true,
    });

    const { processModelData } = require('~/utils');
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

  it('attempts to use OPENROUTER_API_KEY if set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-router-key';
    const expectedModels = ['model-router-1', 'model-router-2'];

    axios.get.mockResolvedValue({
      data: {
        data: expectedModels.map((id) => ({ id })),
      },
    });

    const models = await getOpenAIModels({ user: 'user456' });

    expect(models).toEqual(expect.arrayContaining(expectedModels));
    expect(axios.get).toHaveBeenCalled();
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
    expect(axios.get).toHaveBeenCalledWith('https://api.ollama.test.com/api/tags'); // Adjusted to expect only one argument if no options are passed
  });

  it('should handle errors gracefully when fetching Ollama models fails', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));
    const models = await fetchModels({
      user: 'user789',
      apiKey: 'testApiKey',
      baseURL: 'https://api.ollama.test.com',
      name: 'OllamaAPI',
    });

    expect(models).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
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
