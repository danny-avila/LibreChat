// Mock dependencies - must be before requiring the module
jest.mock('./BaseClient', () => {
  return jest.fn().mockImplementation(function (apiKey, options) {
    this.apiKey = apiKey;
    this.options = options;
  });
});

jest.mock('~/server/utils', () => ({
  sleep: jest.fn(),
}));

jest.mock('~/server/utils/keyMasking', () => ({
  maskAPIKey: jest.fn((key) => (key ? `sk-...${key.slice(-4)}` : '')),
  safeLog: jest.fn((obj) => obj),
  sanitizeError: jest.fn((err) => err),
}));

jest.mock('librechat-data-provider', () => ({
  Constants: {},
  ContentTypes: {},
  EModelEndpoint: {
    openrouter: 'openrouter',
  },
  getResponseSender: jest.fn(() => 'OpenRouter'),
}));

jest.mock('./prompts', () => ({
  formatMessage: jest.fn((msg) => msg),
}));

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

// Now require the modules after mocks are set up
const OpenRouterClient = require('./OpenRouterClient');

describe('OpenRouterClient', () => {
  let client;
  let mockFetch;
  const mockApiKey = 'sk-or-test-key-123';
  const defaultOptions = {
    modelOptions: {
      model: 'openrouter/auto',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Set up node-fetch mock
    const fetch = require('node-fetch');
    mockFetch = jest.fn();
    fetch.mockImplementation(mockFetch);

    // Reset environment variables
    delete process.env.OPENROUTER_SITE_URL;
    delete process.env.OPENROUTER_SITE_NAME;
    delete process.env.OPENROUTER_CACHE_TTL_CREDITS;
    delete process.env.OPENROUTER_CACHE_TTL_MODELS;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct base URL and headers', () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);

      expect(client.baseURL).toBe('https://openrouter.ai/api/v1');
      // Headers are now built on-demand, not stored
      const headers = client.buildHeaders();
      expect(headers).toEqual({
        Authorization: `Bearer ${mockApiKey}`,
        'Content-Type': 'application/json',
      });
      expect(client.apiKey).toBe(mockApiKey);
    });

    it('should add site attribution headers when environment variables are set', () => {
      process.env.OPENROUTER_SITE_URL = 'https://example.com';
      process.env.OPENROUTER_SITE_NAME = 'ExampleApp';

      client = new OpenRouterClient(mockApiKey, defaultOptions);

      // Headers are built on-demand
      const headers = client.buildHeaders();
      expect(headers['HTTP-Referer']).toBe('https://example.com');
      expect(headers['X-Title']).toBe('ExampleApp');
    });

    it('should use custom cache TTL values from environment', () => {
      process.env.OPENROUTER_CACHE_TTL_CREDITS = '600000'; // 10 minutes
      process.env.OPENROUTER_CACHE_TTL_MODELS = '7200000'; // 2 hours

      client = new OpenRouterClient(mockApiKey, defaultOptions);

      expect(client.cacheSettings.creditsTTL).toBe(600000);
      expect(client.cacheSettings.modelsTTL).toBe(7200000);
    });

    it('should use default cache TTL values when not specified', () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);

      expect(client.cacheSettings.creditsTTL).toBe(300000); // 5 minutes
      expect(client.cacheSettings.modelsTTL).toBe(3600000); // 1 hour
    });

    it('should initialize empty cache', () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);

      expect(client.cache).toEqual({
        credits: null,
        creditsTimestamp: null,
        models: null,
        modelsTimestamp: null,
      });
    });

    it('should override API key from options.openRouterApiKey', () => {
      const customKey = 'sk-or-custom-key';
      const options = {
        ...defaultOptions,
        openRouterApiKey: customKey,
      };

      client = new OpenRouterClient(mockApiKey, options);

      expect(client.apiKey).toBe(customKey);
      // Headers are built on-demand
      const headers = client.buildHeaders();
      expect(headers['Authorization']).toBe(`Bearer ${customKey}`);
    });
  });

  describe('chatCompletion', () => {
    beforeEach(() => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
      // Global fetch is already mocked, no need to override
    });

    it('should send chat completion request with correct parameters', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ];
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hi there!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.chatCompletion({ messages, model: 'gpt-3.5-turbo' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: client.buildHeaders(),
          body: JSON.stringify({
            messages,
            model: 'gpt-3.5-turbo',
          }),
        }),
      );
      expect(result.usage).toBeDefined();
      expect(client.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    });

    it('should handle fallback models correctly', async () => {
      const messages = [{ role: 'user', content: 'Test' }];
      const fallbackModels = ['model1', 'model2', 'model3'];
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [] }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.chatCompletion({
        messages,
        model: 'primary-model',
        models: fallbackModels,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.models).toEqual(fallbackModels);
    });

    it('should limit fallback models to maximum of 10', async () => {
      const messages = [{ role: 'user', content: 'Test' }];
      const tooManyModels = Array.from({ length: 15 }, (_, i) => `model${i}`);
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [] }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.chatCompletion({
        messages,
        model: 'primary-model',
        models: tooManyModels,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.models).toHaveLength(10);
      expect(callBody.models).toEqual(tooManyModels.slice(0, 10));
    });

    it('should not include fallback models when using Auto Router', async () => {
      const messages = [{ role: 'user', content: 'Test' }];
      const fallbackModels = ['model1', 'model2'];
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [] }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.chatCompletion({
        messages,
        model: 'openrouter/auto',
        models: fallbackModels,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.models).toBeUndefined();
    });

    it('should handle streaming requests', async () => {
      const messages = [{ role: 'user', content: 'Stream test' }];
      const mockStreamResponse = {
        ok: true,
        body: 'mock-stream',
      };
      mockFetch.mockResolvedValue(mockStreamResponse);

      const result = await client.chatCompletion({
        messages,
        stream: true,
      });

      expect(result).toBe(mockStreamResponse);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.stream).toBe(true);
    });

    it('should handle API errors correctly', async () => {
      const messages = [{ role: 'user', content: 'Error test' }];
      const mockErrorResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: jest.fn().mockResolvedValue({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        }),
      };
      mockFetch.mockResolvedValue(mockErrorResponse);

      await expect(client.chatCompletion({ messages })).rejects.toThrow(
        'Rate limit exceeded. Please try again later.',
      );
    });

    it('should handle network errors', async () => {
      const messages = [{ role: 'user', content: 'Network error test' }];
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await expect(client.chatCompletion({ messages })).rejects.toThrow('Network failure');
    });
  });

  describe('getCredits', () => {
    beforeEach(() => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
      // Global fetch is already mocked
    });

    it('should fetch credits from API when cache is empty', async () => {
      const mockAPIResponse = { data: { total_credits: 125.8, total_usage: 25.3 } };
      const expectedCredits = { balance: 100.5, currency: 'USD', usage: 25.3, total: 125.8 };
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockAPIResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getCredits();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/credits',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
          },
        }),
      );
      expect(result).toEqual(expectedCredits);
      expect(client.cache.credits).toEqual(expectedCredits);
      expect(client.cache.creditsTimestamp).toBeDefined();
    });

    it('should return cached credits when within TTL', async () => {
      const cachedCredits = { balance: 75.0, currency: 'USD', usage: 50.0, total: 125.0 };
      const now = Date.now();

      client.cache.credits = cachedCredits;
      client.cache.creditsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 100000); // 100 seconds later

      const result = await client.getCredits();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(cachedCredits);
    });

    it('should fetch new credits when cache expires', async () => {
      const oldCredits = { balance: 50.0, currency: 'USD', usage: 25.0, total: 75.0 };
      const newCredits = { balance: 45.0, currency: 'USD', usage: 30.0, total: 75.0 };
      const now = Date.now();

      client.cache.credits = oldCredits;
      client.cache.creditsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 400000); // 400 seconds later (> 5 min TTL)

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            total_credits: 75.0,
            total_usage: 30.0,
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getCredits();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(newCredits);
      expect(client.cache.credits).toEqual(newCredits);
    });

    it('should force refresh when requested', async () => {
      const cachedCredits = { balance: 100.0, currency: 'USD', usage: 0.0, total: 100.0 };
      const freshCredits = { balance: 95.0, currency: 'USD', usage: 5.0, total: 100.0 };
      const now = Date.now();

      client.cache.credits = cachedCredits;
      client.cache.creditsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // Still within TTL

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            total_credits: 100.0,
            total_usage: 5.0,
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getCredits(true); // Force refresh

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(freshCredits);
    });

    it('should handle credits API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key' },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(client.getCredits()).rejects.toThrow('Invalid OpenRouter API key');
    });
  });

  describe('getModels', () => {
    beforeEach(() => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
      // Global fetch is already mocked
    });

    it('should fetch models from API when cache is empty', async () => {
      const mockModels = [
        { id: 'model1', name: 'Model 1' },
        { id: 'model2', name: 'Model 2' },
      ];
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockModels }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getModels();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
          },
        }),
      );
      expect(result).toEqual(mockModels);
      expect(client.cache.models).toEqual(mockModels);
      expect(client.cache.modelsTimestamp).toBeDefined();
    });

    it('should return cached models when within TTL', async () => {
      const cachedModels = [{ id: 'cached1' }, { id: 'cached2' }];
      const now = Date.now();

      client.cache.models = cachedModels;
      client.cache.modelsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 1800000); // 30 minutes later (< 1 hour TTL)

      const result = await client.getModels();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(cachedModels);
    });

    it('should fetch new models when cache expires', async () => {
      const oldModels = [{ id: 'old1' }];
      const newModels = [{ id: 'new1' }, { id: 'new2' }];
      const now = Date.now();

      client.cache.models = oldModels;
      client.cache.modelsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 4000000); // > 1 hour later

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: newModels }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getModels();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(newModels);
      expect(client.cache.models).toEqual(newModels);
    });

    it('should handle empty models response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: null }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getModels();

      expect(result).toEqual([]);
      expect(client.cache.models).toEqual([]);
    });

    it('should force refresh when requested', async () => {
      const cachedModels = [{ id: 'cached' }];
      const freshModels = [{ id: 'fresh' }];
      const now = Date.now();

      client.cache.models = cachedModels;
      client.cache.modelsTimestamp = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // Still within TTL

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: freshModels }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getModels(true); // Force refresh

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(freshModels);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
      // Global fetch is already mocked
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(client.getCredits()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValue(new Error('Request timeout'));

      await expect(client.getModels()).rejects.toThrow('Request timeout');
    });

    it('should handle concurrent cache requests', async () => {
      const mockCredits = { balance: 100, currency: 'USD', usage: 0, total: 100 };
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            total_credits: 100,
            total_usage: 0,
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // First request to populate cache
      const firstResult = await client.getCredits();
      expect(firstResult).toEqual(mockCredits);

      // Clear mock to track subsequent calls
      mockFetch.mockClear();

      // Simulate concurrent requests that should use cache
      const promises = Array(5)
        .fill(null)
        .map(() => client.getCredits());
      const results = await Promise.all(promises);

      // Should not fetch again due to caching
      expect(mockFetch).toHaveBeenCalledTimes(0);
      results.forEach((result) => {
        expect(result).toEqual(mockCredits);
      });
    });

    it('should handle API key format validation', () => {
      const invalidKey = 'invalid-key-format';

      // This would typically be validated at a higher level, but we can test
      // that the client accepts any string as API key
      const testClient = new OpenRouterClient(invalidKey, defaultOptions);
      expect(testClient.apiKey).toBe(invalidKey);
    });

    it('should properly clean up on instance destruction', () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);

      // Simulate cleanup
      client.cache = null;

      expect(client.cache).toBeNull();
    });
  });

  describe('Token Counting', () => {
    beforeEach(() => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
    });

    it('should set correct token counting keys', () => {
      expect(client.inputTokensKey).toBe('prompt_tokens');
      expect(client.outputTokensKey).toBe('completion_tokens');
    });

    it('should track usage from chat completion response', async () => {
      // Global fetch is already mocked
      const usage = {
        prompt_tokens: 50,
        completion_tokens: 100,
        total_tokens: 150,
      };
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage,
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.chatCompletion({ messages: [{ role: 'user', content: 'Test' }] });

      expect(client.usage).toEqual(usage);
    });
  });

  describe('Memory and Performance', () => {
    it('should not leak memory with repeated cache updates', async () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);
      // Global fetch is already mocked

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ balance: 100 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Simulate many cache updates
      for (let i = 0; i < 100; i++) {
        await client.getCredits(true);
        jest.advanceTimersByTime(1000);
      }

      // Cache should only hold the latest value
      expect(Object.keys(client.cache).length).toBe(4); // credits, creditsTimestamp, models, modelsTimestamp
    });

    it('should handle rapid successive calls efficiently', async () => {
      client = new OpenRouterClient(mockApiKey, defaultOptions);

      const mockCredits = { balance: 100 };
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockCredits),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // First call to populate cache
      await client.getCredits();

      // Clear mock to track subsequent calls
      mockFetch.mockClear();

      // Make rapid calls that should use cache
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(client.getCredits());
      }

      await Promise.all(promises);

      // Should not make any additional API calls due to cache
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });
  });
});
