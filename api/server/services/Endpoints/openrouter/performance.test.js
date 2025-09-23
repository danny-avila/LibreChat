/**
 * Performance Test Suite for OpenRouter Credits Optimization
 *
 * Tests validate that the performance optimizations achieve the target of >90% reduction in API calls
 */

const OptimizedService = require('./OptimizedService');
const { logger } = require('~/config');

// Mock dependencies
jest.mock('~/app/clients/OpenRouterClient');
jest.mock('~/config');
jest.mock('~/cache');

describe('OpenRouter Performance Optimizations', () => {
  let service;
  let mockClient;
  const testApiKey = 'sk-or-test-key';

  beforeEach(() => {
    jest.clearAllMocks();
    service = OptimizedService;
    service.clearCache();

    mockClient = {
      getCredits: jest.fn().mockResolvedValue({ balance: 10.5, currency: 'USD' }),
      getModels: jest.fn().mockResolvedValue([
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'claude-3', name: 'Claude 3' },
      ]),
      chatCompletion: jest.fn().mockResolvedValue({ response: 'test' }),
    };

    service.getClient = jest.fn().mockReturnValue(mockClient);
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Request Coalescing', () => {
    it('should coalesce concurrent identical requests', async () => {
      // Simulate 10 concurrent requests for credits
      const promises = Array(10)
        .fill(null)
        .map(() => service.getCredits(testApiKey));

      const results = await Promise.all(promises);

      // Should only make 1 actual API call
      expect(mockClient.getCredits).toHaveBeenCalledTimes(1);

      // All results should be identical
      results.forEach((result) => {
        expect(result).toEqual({ balance: 10.5, currency: 'USD' });
      });

      // Check stats
      const stats = service.getStats();
      expect(stats.coalescedRequests).toBe(9); // 9 requests were coalesced
    });

    it('should handle mixed concurrent requests', async () => {
      // Simulate concurrent credits and models requests
      const creditPromises = Array(5)
        .fill(null)
        .map(() => service.getCredits(testApiKey));

      const modelPromises = Array(5)
        .fill(null)
        .map(() => service.getModels(testApiKey));

      await Promise.all([...creditPromises, ...modelPromises]);

      // Should only make 1 call for each type
      expect(mockClient.getCredits).toHaveBeenCalledTimes(1);
      expect(mockClient.getModels).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Performance', () => {
    it('should achieve >90% cache hit rate after initial load', async () => {
      // Initial request (cache miss)
      await service.getCredits(testApiKey);

      // Simulate 100 subsequent requests
      for (let i = 0; i < 100; i++) {
        await service.getCredits(testApiKey);
      }

      const stats = service.getStats();
      const hitRate = parseFloat(stats.creditsHitRate.replace('%', ''));

      // Should achieve >90% hit rate
      expect(hitRate).toBeGreaterThanOrEqual(90);

      // Should only make 1 API call (initial)
      expect(mockClient.getCredits).toHaveBeenCalledTimes(1);
    });

    it('should handle cache expiry correctly', async () => {
      jest.useFakeTimers();

      // Initial request
      await service.getCredits(testApiKey);
      expect(mockClient.getCredits).toHaveBeenCalledTimes(1);

      // Request within TTL (should use cache)
      jest.advanceTimersByTime(4 * 60 * 1000); // 4 minutes
      await service.getCredits(testApiKey);
      expect(mockClient.getCredits).toHaveBeenCalledTimes(1);

      // Request after TTL (should fetch new)
      jest.advanceTimersByTime(2 * 60 * 1000); // +2 minutes = 6 minutes total
      await service.getCredits(testApiKey);
      expect(mockClient.getCredits).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Background Refresh', () => {
    it('should not block on stale data with background refresh', async () => {
      jest.useFakeTimers();

      // Initial request
      await service.getCredits(testApiKey);

      // Advance to 80% of TTL (should trigger background refresh)
      jest.advanceTimersByTime(4 * 60 * 1000); // 4 minutes

      // This request should return immediately with stale data
      const start = Date.now();
      const result = await service.getCredits(testApiKey);
      const duration = Date.now() - start;

      // Should return immediately (< 10ms)
      expect(duration).toBeLessThan(10);
      expect(result).toEqual({ balance: 10.5, currency: 'USD' });

      // Background refresh should be scheduled
      expect(service.getStats().scheduledRefreshes).toBeGreaterThan(0);

      jest.useRealTimers();
    });
  });

  describe('Error Handling with Stale Data', () => {
    it('should return stale data when API fails', async () => {
      // Initial successful request
      await service.getCredits(testApiKey);

      // Make API fail
      mockClient.getCredits.mockRejectedValue(new Error('API Error'));

      // Force refresh (should fail but return stale)
      const result = await service.getCredits(testApiKey, true);

      expect(result).toEqual({ balance: 10.5, currency: 'USD' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Returning stale credits'),
        expect.any(Object),
      );
    });
  });

  describe('Multi-API Key Isolation', () => {
    it('should maintain separate caches per API key', async () => {
      const apiKey1 = 'sk-or-key1';
      const apiKey2 = 'sk-or-key2';

      mockClient.getCredits
        .mockResolvedValueOnce({ balance: 10, currency: 'USD' })
        .mockResolvedValueOnce({ balance: 20, currency: 'USD' });

      const result1 = await service.getCredits(apiKey1);
      const result2 = await service.getCredits(apiKey2);

      expect(result1.balance).toBe(10);
      expect(result2.balance).toBe(20);
      expect(mockClient.getCredits).toHaveBeenCalledTimes(2);

      // Subsequent requests should use cache
      await service.getCredits(apiKey1);
      await service.getCredits(apiKey2);
      expect(mockClient.getCredits).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Metrics', () => {
    it('should track performance statistics accurately', async () => {
      // Generate mixed traffic pattern
      await service.getCredits(testApiKey); // Miss
      await service.getCredits(testApiKey); // Hit
      await service.getCredits(testApiKey); // Hit
      await service.getModels(testApiKey); // Miss
      await service.getModels(testApiKey); // Hit

      const stats = service.getStats();

      expect(stats).toMatchObject({
        creditsHits: 2,
        creditsMisses: 1,
        modelsHits: 1,
        modelsMisses: 1,
        creditsHitRate: '66.67%',
        modelsHitRate: '50.00%',
        activeClients: 1,
        pendingRequests: 0,
      });
    });
  });

  describe('Real-world Scenario Simulation', () => {
    it('should handle realistic chat session efficiently', async () => {
      // Simulate a typical chat session
      const totalMessages = 20;

      let apiCalls = 0;
      mockClient.getCredits.mockImplementation(() => {
        apiCalls++;
        return Promise.resolve({ balance: 10 - apiCalls * 0.01, currency: 'USD' });
      });

      // Initial page load
      await service.getCredits(testApiKey);
      expect(apiCalls).toBe(1);

      // Simulate messages being sent
      for (let i = 0; i < totalMessages; i++) {
        // Chat completion
        await service.chatCompletion(testApiKey, { model: 'gpt-4', messages: [] });

        // Credits are checked after each message (but should be cached/debounced)
        await service.getCredits(testApiKey);
      }

      // With optimizations, we should see minimal API calls
      // Initial (1) + maybe 1-2 refreshes during the session
      expect(apiCalls).toBeLessThanOrEqual(3);

      // Calculate API call reduction
      const withoutOptimization = 1 + totalMessages; // 21 calls
      const withOptimization = apiCalls;
      const reduction = ((withoutOptimization - withOptimization) / withoutOptimization) * 100;

      console.log(`API Call Reduction: ${reduction.toFixed(2)}%`);
      expect(reduction).toBeGreaterThanOrEqual(90); // >90% reduction target
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources properly', async () => {
      // Create some cached data
      await service.getCredits(testApiKey);
      await service.getModels(testApiKey);

      const statsBefore = service.getStats();
      expect(statsBefore.activeClients).toBe(1);

      // Destroy service
      service.destroy();

      // Check cleanup
      expect(service.clients.size).toBe(0);
      expect(service.pendingRequests.size).toBe(0);
      expect(service.refreshIntervals.size).toBe(0);
    });
  });
});
