const { createCircuitBreaker } = require('../../server/utils/circuitBreaker');

describe('Circuit Breaker', () => {
  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker with default options', () => {
      const cb = createCircuitBreaker();
      expect(cb).toBeDefined();
      expect(cb.recordToolCall).toBeDefined();
      expect(cb.shouldBlockTool).toBeDefined();
      expect(cb.getWarningMessage).toBeDefined();
      expect(cb.getStats).toBeDefined();
      expect(cb.reset).toBeDefined();
      expect(cb.isOpen()).toBe(false);
    });

    it('should track tool call successes', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      cb.recordToolCall('test-tool', true);
      cb.recordToolCall('test-tool', true);

      const stats = cb.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalFailures).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
      expect(cb.isOpen()).toBe(false);
    });

    it('should track tool call failures', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      cb.recordToolCall('test-tool', false, new Error('Test error'));

      const stats = cb.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalFailures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should open circuit after maxFailures', () => {
      const onCircuitOpen = jest.fn();
      const cb = createCircuitBreaker({
        maxFailures: 3,
        windowSize: 5,
        onCircuitOpen,
      });

      // Record 3 failures
      cb.recordToolCall('test-tool', false, new Error('Error 1'));
      cb.recordToolCall('test-tool', false, new Error('Error 2'));
      cb.recordToolCall('test-tool', false, new Error('Error 3'));

      expect(cb.isOpen()).toBe(true);
      expect(cb.shouldBlockTool('test-tool')).toBe(true);
      expect(onCircuitOpen).toHaveBeenCalledTimes(1);
      expect(onCircuitOpen).toHaveBeenCalledWith(
        'test-tool',
        expect.objectContaining({
          failureCount: 3,
          windowSize: 5,
        }),
      );
    });

    it('should provide warning message before circuit opens', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      // Record 2 failures (one less than threshold)
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);

      const warning = cb.getWarningMessage('test-tool');
      expect(warning).toBeTruthy();
      expect(warning).toContain('⚠️');
      expect(warning).toContain('test-tool');
      expect(warning).toContain('2 times');
    });

    it('should provide block message when circuit is open', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      // Trigger circuit breaker
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);

      const warning = cb.getWarningMessage('test-tool');
      expect(warning).toBeTruthy();
      expect(warning).toContain('🚫');
      expect(warning).toContain('Circuit breaker activated');
    });

    it('should reset consecutive failures on success', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);
      expect(cb.getStats().consecutiveFailures).toBe(2);

      cb.recordToolCall('test-tool', true); // Success
      expect(cb.getStats().consecutiveFailures).toBe(0);
    });

    it('should track multiple tools independently', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      // Tool 1 fails
      cb.recordToolCall('tool-1', false);
      cb.recordToolCall('tool-1', false);
      cb.recordToolCall('tool-1', false);

      // Tool 2 succeeds
      cb.recordToolCall('tool-2', true);
      cb.recordToolCall('tool-2', true);

      expect(cb.shouldBlockTool('tool-1')).toBe(true);
      expect(cb.shouldBlockTool('tool-2')).toBe(false);
    });

    it('should maintain sliding window of recent calls', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 3 });

      // Fill window with failures
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);

      expect(cb.shouldBlockTool('test-tool')).toBe(true);

      // Add successes to push failures out of window
      cb.recordToolCall('test-tool', true);
      cb.recordToolCall('test-tool', true);
      cb.recordToolCall('test-tool', true);

      // Should have only successes in window now
      const stats = cb.getStats();
      expect(stats.tools['test-tool'].successRate).toBe(1.0);
    });

    it('should reset all state', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);

      expect(cb.isOpen()).toBe(true);

      cb.reset();

      const stats = cb.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(cb.isOpen()).toBe(false);
    });

    it('should provide detailed statistics', () => {
      const cb = createCircuitBreaker({ maxFailures: 3, windowSize: 5 });

      cb.recordToolCall('tool-1', true);
      cb.recordToolCall('tool-1', false);
      cb.recordToolCall('tool-2', false);
      cb.recordToolCall('tool-2', false);

      const stats = cb.getStats();

      expect(stats.totalCalls).toBe(4);
      expect(stats.totalFailures).toBe(3);
      expect(stats.tools['tool-1']).toEqual({
        calls: 2,
        failures: 1,
        successRate: 0.5,
      });
      expect(stats.tools['tool-2']).toEqual({
        calls: 2,
        failures: 2,
        successRate: 0,
      });
    });

    it('should not open circuit if failures are below threshold', () => {
      const onCircuitOpen = jest.fn();
      const cb = createCircuitBreaker({
        maxFailures: 3,
        windowSize: 5,
        onCircuitOpen,
      });

      cb.recordToolCall('test-tool', false);
      cb.recordToolCall('test-tool', false);

      expect(cb.isOpen()).toBe(false);
      expect(onCircuitOpen).not.toHaveBeenCalled();
    });
  });
});
