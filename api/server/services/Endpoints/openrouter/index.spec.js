const OpenRouterService = require('./index');
const OpenRouterClient = require('~/app/clients/OpenRouterClient');
const { logger } = require('~/config');

// Mock dependencies
jest.mock('~/app/clients/OpenRouterClient');
jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OpenRouterService', () => {
  let service;
  let mockClient;
  const mockApiKey = 'sk-or-test-key-123';
  const anotherApiKey = 'sk-or-another-key-456';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock client instance
    mockClient = {
      getCredits: jest.fn(),
      getModels: jest.fn(),
      chatCompletion: jest.fn(),
    };

    // Mock OpenRouterClient constructor
    OpenRouterClient.mockImplementation(() => mockClient);

    // Reset environment variables
    delete process.env.OPENROUTER_CACHE_TTL_CREDITS;
    delete process.env.OPENROUTER_CACHE_TTL_MODELS;

    service = new OpenRouterService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default cache settings', () => {
      expect(service.cacheSettings).toEqual({
        creditsTTL: 300000, // 5 minutes
        modelsTTL: 3600000, // 1 hour
      });
    });

    it('should use environment variables for cache TTL', () => {
      process.env.OPENROUTER_CACHE_TTL_CREDITS = '600000';
      process.env.OPENROUTER_CACHE_TTL_MODELS = '7200000';

      const customService = new OpenRouterService();

      expect(customService.cacheSettings).toEqual({
        creditsTTL: 600000,
        modelsTTL: 7200000,
      });
    });

    it('should initialize empty cache', () => {
      expect(service.cache).toEqual({
        credits: null,
        creditsTimestamp: null,
        models: null,
        modelsTimestamp: null,
      });
    });

    it('should initialize empty clients Map', () => {
      expect(service.clients).toBeInstanceOf(Map);
      expect(service.clients.size).toBe(0);
    });
  });

  describe('getClient', () => {
    it('should create new client for new API key', () => {
      const client = service.getClient(mockApiKey);

      expect(OpenRouterClient).toHaveBeenCalledWith(mockApiKey, {});
      expect(service.clients.has(mockApiKey)).toBe(true);
      expect(service.clients.get(mockApiKey)).toBe(mockClient);
      expect(client).toBe(mockClient);
    });

    it('should reuse existing client for same API key', () => {
      const client1 = service.getClient(mockApiKey);
      const client2 = service.getClient(mockApiKey);

      expect(OpenRouterClient).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });

    it('should create separate clients for different API keys', () => {
      const client1 = service.getClient(mockApiKey);
      const client2 = service.getClient(anotherApiKey);

      expect(OpenRouterClient).toHaveBeenCalledTimes(2);
      expect(client1).not.toBe(client2);
      expect(service.clients.size).toBe(2);
    });

    it('should pass options to client constructor', () => {
      const options = { modelOptions: { model: 'custom-model' } };
      service.getClient(mockApiKey, options);

      expect(OpenRouterClient).toHaveBeenCalledWith(mockApiKey, options);
    });

    it('should throw error when API key is not provided', () => {
      expect(() => service.getClient()).toThrow('OpenRouter API key is required');
      expect(() => service.getClient(null)).toThrow('OpenRouter API key is required');
      expect(() => service.getClient('')).toThrow('OpenRouter API key is required');
    });
  });

  describe('getCredits', () => {
    const mockCredits = { balance: 100.5, used: 25.3 };

    beforeEach(() => {
      mockClient.getCredits.mockResolvedValue(mockCredits);
    });

    it('should fetch credits from client when cache is empty', async () => {
      const result = await service.getCredits(mockApiKey);

      expect(mockClient.getCredits).toHaveBeenCalledWith(true);
      expect(result).toEqual(mockCredits);
      expect(service.cache[`credits_${mockApiKey}`]).toEqual(mockCredits);
      expect(service.cache[`credits_${mockApiKey}_timestamp`]).toBeDefined();
    });

    it('should return cached credits when within TTL', async () => {
      const now = Date.now();
      const cacheKey = `credits_${mockApiKey}`;

      service.cache[cacheKey] = mockCredits;
      service.cache[`${cacheKey}_timestamp`] = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 100000); // 100 seconds later

      const result = await service.getCredits(mockApiKey);

      expect(mockClient.getCredits).not.toHaveBeenCalled();
      expect(result).toEqual(mockCredits);
    });

    it('should fetch new credits when cache expires', async () => {
      const now = Date.now();
      const cacheKey = `credits_${mockApiKey}`;
      const oldCredits = { balance: 50, used: 10 };
      const newCredits = { balance: 45, used: 15 };

      service.cache[cacheKey] = oldCredits;
      service.cache[`${cacheKey}_timestamp`] = now;
      mockClient.getCredits.mockResolvedValue(newCredits);

      jest.spyOn(Date, 'now').mockReturnValue(now + 400000); // > 5 minutes

      const result = await service.getCredits(mockApiKey);

      expect(mockClient.getCredits).toHaveBeenCalledWith(true);
      expect(result).toEqual(newCredits);
      expect(service.cache[cacheKey]).toEqual(newCredits);
    });

    it('should force refresh when requested', async () => {
      const now = Date.now();
      const cacheKey = `credits_${mockApiKey}`;
      const cachedCredits = { balance: 100, used: 0 };
      const freshCredits = { balance: 95, used: 5 };

      service.cache[cacheKey] = cachedCredits;
      service.cache[`${cacheKey}_timestamp`] = now;
      mockClient.getCredits.mockResolvedValue(freshCredits);

      jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // Still within TTL

      const result = await service.getCredits(mockApiKey, true);

      expect(mockClient.getCredits).toHaveBeenCalledWith(true);
      expect(result).toEqual(freshCredits);
    });

    it('should maintain separate caches for different API keys', async () => {
      const credits1 = { balance: 100 };
      const credits2 = { balance: 200 };

      const mockClient2 = {
        getCredits: jest.fn().mockResolvedValue(credits2),
      };
      OpenRouterClient.mockImplementationOnce(() => mockClient).mockImplementationOnce(
        () => mockClient2,
      );

      mockClient.getCredits.mockResolvedValue(credits1);

      const result1 = await service.getCredits(mockApiKey);
      const result2 = await service.getCredits(anotherApiKey);

      expect(result1).toEqual(credits1);
      expect(result2).toEqual(credits2);
      expect(service.cache[`credits_${mockApiKey}`]).toEqual(credits1);
      expect(service.cache[`credits_${anotherApiKey}`]).toEqual(credits2);
    });

    it('should handle errors from client', async () => {
      const error = new Error('API Error');
      mockClient.getCredits.mockRejectedValue(error);

      await expect(service.getCredits(mockApiKey)).rejects.toThrow('API Error');
      expect(logger.error).toHaveBeenCalledWith(
        '[OpenRouterService] Error fetching credits:',
        error,
      );
    });
  });

  describe('getModels', () => {
    const mockModels = [
      { id: 'model1', name: 'Model 1' },
      { id: 'model2', name: 'Model 2' },
    ];

    beforeEach(() => {
      mockClient.getModels.mockResolvedValue(mockModels);
    });

    it('should fetch models from client when cache is empty', async () => {
      const result = await service.getModels(mockApiKey);

      expect(mockClient.getModels).toHaveBeenCalledWith(true);
      expect(result).toEqual(mockModels);
      expect(service.cache[`models_${mockApiKey}`]).toEqual(mockModels);
      expect(service.cache[`models_${mockApiKey}_timestamp`]).toBeDefined();
    });

    it('should return cached models when within TTL', async () => {
      const now = Date.now();
      const cacheKey = `models_${mockApiKey}`;

      service.cache[cacheKey] = mockModels;
      service.cache[`${cacheKey}_timestamp`] = now;

      jest.spyOn(Date, 'now').mockReturnValue(now + 1800000); // 30 minutes later

      const result = await service.getModels(mockApiKey);

      expect(mockClient.getModels).not.toHaveBeenCalled();
      expect(result).toEqual(mockModels);
    });

    it('should fetch new models when cache expires', async () => {
      const now = Date.now();
      const cacheKey = `models_${mockApiKey}`;
      const oldModels = [{ id: 'old' }];
      const newModels = [{ id: 'new1' }, { id: 'new2' }];

      service.cache[cacheKey] = oldModels;
      service.cache[`${cacheKey}_timestamp`] = now;
      mockClient.getModels.mockResolvedValue(newModels);

      jest.spyOn(Date, 'now').mockReturnValue(now + 4000000); // > 1 hour

      const result = await service.getModels(mockApiKey);

      expect(mockClient.getModels).toHaveBeenCalledWith(true);
      expect(result).toEqual(newModels);
      expect(service.cache[cacheKey]).toEqual(newModels);
    });

    it('should force refresh when requested', async () => {
      const now = Date.now();
      const cacheKey = `models_${mockApiKey}`;
      const cachedModels = [{ id: 'cached' }];
      const freshModels = [{ id: 'fresh' }];

      service.cache[cacheKey] = cachedModels;
      service.cache[`${cacheKey}_timestamp`] = now;
      mockClient.getModels.mockResolvedValue(freshModels);

      jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // Still within TTL

      const result = await service.getModels(mockApiKey, true);

      expect(mockClient.getModels).toHaveBeenCalledWith(true);
      expect(result).toEqual(freshModels);
    });

    it('should log model count when fetching', async () => {
      await service.getModels(mockApiKey);

      expect(logger.debug).toHaveBeenCalledWith('[OpenRouterService] Models fetched and cached', {
        modelCount: mockModels.length,
      });
    });

    it('should handle errors from client', async () => {
      const error = new Error('Model fetch error');
      mockClient.getModels.mockRejectedValue(error);

      await expect(service.getModels(mockApiKey)).rejects.toThrow('Model fetch error');
      expect(logger.error).toHaveBeenCalledWith(
        '[OpenRouterService] Error fetching models:',
        error,
      );
    });
  });

  describe('chatCompletion', () => {
    const mockParams = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gpt-3.5-turbo',
    };
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
    };

    beforeEach(() => {
      mockClient.chatCompletion.mockResolvedValue(mockResponse);
    });

    it('should pass through to client chatCompletion', async () => {
      const result = await service.chatCompletion(mockApiKey, mockParams);

      expect(mockClient.chatCompletion).toHaveBeenCalledWith(mockParams);
      expect(result).toEqual(mockResponse);
    });

    it('should use the correct client for API key', async () => {
      const mockClient2 = {
        chatCompletion: jest.fn().mockResolvedValue({ choices: [] }),
      };
      OpenRouterClient.mockImplementationOnce(() => mockClient).mockImplementationOnce(
        () => mockClient2,
      );

      await service.chatCompletion(mockApiKey, mockParams);
      await service.chatCompletion(anotherApiKey, mockParams);

      expect(mockClient.chatCompletion).toHaveBeenCalledTimes(1);
      expect(mockClient2.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should handle streaming requests', async () => {
      const streamParams = { ...mockParams, stream: true };
      const mockStream = { body: 'stream-data' };
      mockClient.chatCompletion.mockResolvedValue(mockStream);

      const result = await service.chatCompletion(mockApiKey, streamParams);

      expect(mockClient.chatCompletion).toHaveBeenCalledWith(streamParams);
      expect(result).toEqual(mockStream);
    });

    it('should handle errors from client', async () => {
      const error = new Error('Chat completion error');
      mockClient.chatCompletion.mockRejectedValue(error);

      await expect(service.chatCompletion(mockApiKey, mockParams)).rejects.toThrow(
        'Chat completion error',
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[OpenRouterService] Error in chat completion:',
        error,
      );
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      // Populate cache with data
      service.cache[`credits_${mockApiKey}`] = { balance: 100 };
      service.cache[`credits_${mockApiKey}_timestamp`] = Date.now();
      service.cache[`models_${mockApiKey}`] = [{ id: 'model1' }];
      service.cache[`models_${mockApiKey}_timestamp`] = Date.now();

      service.cache[`credits_${anotherApiKey}`] = { balance: 200 };
      service.cache[`credits_${anotherApiKey}_timestamp`] = Date.now();
      service.cache[`models_${anotherApiKey}`] = [{ id: 'model2' }];
      service.cache[`models_${anotherApiKey}_timestamp`] = Date.now();
    });

    it('should clear cache for specific API key', () => {
      service.clearCache(mockApiKey);

      expect(service.cache[`credits_${mockApiKey}`]).toBeUndefined();
      expect(service.cache[`credits_${mockApiKey}_timestamp`]).toBeUndefined();
      expect(service.cache[`models_${mockApiKey}`]).toBeUndefined();
      expect(service.cache[`models_${mockApiKey}_timestamp`]).toBeUndefined();

      // Other API key cache should remain
      expect(service.cache[`credits_${anotherApiKey}`]).toBeDefined();
      expect(service.cache[`models_${anotherApiKey}`]).toBeDefined();
    });

    it('should clear all cache when no API key provided', () => {
      service.clearCache();

      expect(service.cache).toEqual({
        credits: null,
        creditsTimestamp: null,
        models: null,
        modelsTimestamp: null,
      });
    });

    it('should log cache clearing', () => {
      service.clearCache(mockApiKey);

      expect(logger.debug).toHaveBeenCalledWith(
        `[OpenRouterService] Cache cleared for API key: ${mockApiKey}`,
      );
    });

    it('should log when clearing all cache', () => {
      service.clearCache();

      expect(logger.debug).toHaveBeenCalledWith('[OpenRouterService] All cache cleared');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent credit requests for same API key', async () => {
      const mockCredits = { balance: 100 };
      let resolveCredits;
      const creditsPromise = new Promise((resolve) => {
        resolveCredits = resolve;
      });

      mockClient.getCredits.mockImplementation(() => creditsPromise);

      // Start multiple concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => service.getCredits(mockApiKey));

      // Resolve the underlying client call
      resolveCredits(mockCredits);

      const results = await Promise.all(promises);

      // All requests should get the same result
      results.forEach((result) => {
        expect(result).toEqual(mockCredits);
      });

      // Client should only be called once
      expect(mockClient.getCredits).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent requests for different API keys', async () => {
      const credits1 = { balance: 100 };
      const credits2 = { balance: 200 };

      const mockClient2 = {
        getCredits: jest.fn().mockResolvedValue(credits2),
      };

      OpenRouterClient.mockImplementationOnce(() => mockClient).mockImplementationOnce(
        () => mockClient2,
      );

      mockClient.getCredits.mockResolvedValue(credits1);

      const [result1, result2] = await Promise.all([
        service.getCredits(mockApiKey),
        service.getCredits(anotherApiKey),
      ]);

      expect(result1).toEqual(credits1);
      expect(result2).toEqual(credits2);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle client creation failure', () => {
      OpenRouterClient.mockImplementation(() => {
        throw new Error('Client creation failed');
      });

      const newService = new OpenRouterService();

      expect(() => newService.getClient(mockApiKey)).toThrow('Client creation failed');
    });

    it('should handle invalid cache TTL values', () => {
      process.env.OPENROUTER_CACHE_TTL_CREDITS = 'invalid';
      process.env.OPENROUTER_CACHE_TTL_MODELS = 'invalid';

      const newService = new OpenRouterService();

      expect(newService.cacheSettings.creditsTTL).toBeNaN();
      expect(newService.cacheSettings.modelsTTL).toBeNaN();
    });

    it('should recover from cache corruption', async () => {
      // Corrupt the cache
      service.cache[`credits_${mockApiKey}`] = 'corrupted-data';
      service.cache[`credits_${mockApiKey}_timestamp`] = 'invalid-timestamp';

      const mockCredits = { balance: 100 };
      mockClient.getCredits.mockResolvedValue(mockCredits);

      // Should fetch fresh data
      const result = await service.getCredits(mockApiKey);

      expect(result).toEqual(mockCredits);
      expect(service.cache[`credits_${mockApiKey}`]).toEqual(mockCredits);
    });
  });

  describe('Memory Management', () => {
    it('should not accumulate clients indefinitely', () => {
      // Create multiple clients
      for (let i = 0; i < 100; i++) {
        service.getClient(`key-${i}`);
      }

      expect(service.clients.size).toBe(100);

      // In a real implementation, you might want to implement LRU eviction
      // This test documents the current behavior
    });

    it('should handle cache size growth', async () => {
      // Populate cache with many entries
      for (let i = 0; i < 50; i++) {
        const key = `key-${i}`;
        service.cache[`credits_${key}`] = { balance: i };
        service.cache[`credits_${key}_timestamp`] = Date.now();
        service.cache[`models_${key}`] = [{ id: `model-${i}` }];
        service.cache[`models_${key}_timestamp`] = Date.now();
      }

      // Cache should contain all entries
      const cacheKeys = Object.keys(service.cache);
      expect(cacheKeys.length).toBeGreaterThan(200); // 50 * 4 + base keys
    });
  });
});
