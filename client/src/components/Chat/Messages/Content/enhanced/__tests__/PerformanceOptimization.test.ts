/**
 * Performance Optimization Tests
 * Tests for lazy loading, caching, memory management, and performance monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// Mock the performance utilities since they may not exist yet
const LazyLoader = jest.fn();
const LRUCache = jest.fn();
const MemoryManager = jest.fn();
const PerformanceMonitor = jest.fn();
const CacheManager = jest.fn();

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    memory: {
      usedJSHeapSize: 50 * 1024 * 1024,
      totalJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 200 * 1024 * 1024,
    },
  },
  writable: true,
});

// Mock navigator
Object.defineProperty(window, 'navigator', {
  value: {
    deviceMemory: 4,
    hardwareConcurrency: 4,
    connection: {
      effectiveType: '4g',
    },
  },
  writable: true,
});

describe('LazyLoader', () => {
  let lazyLoader: LazyLoader;
  let mockElement: Element;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    lazyLoader = new LazyLoader();
    mockElement = document.createElement('div');
    mockCallback = jest.fn();
  });

  afterEach(() => {
    lazyLoader.disconnect();
  });

  it('should create intersection observer with correct options', () => {
    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        rootMargin: '50px',
        threshold: 0.1,
      })
    );
  });

  it('should observe elements for lazy loading', () => {
    const mockObserver = {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };
    mockIntersectionObserver.mockReturnValue(mockObserver);

    const newLazyLoader = new LazyLoader();
    newLazyLoader.observe(mockElement, mockCallback);

    expect(mockObserver.observe).toHaveBeenCalledWith(mockElement);
  });

  it('should provide loading statistics', () => {
    lazyLoader.observe(mockElement, mockCallback);
    const stats = lazyLoader.getStats();

    expect(stats).toEqual({
      total: 1,
      loaded: 0,
      pending: 1,
    });
  });

  it('should handle fallback when IntersectionObserver is not supported', () => {
    // Temporarily remove IntersectionObserver
    const originalIO = window.IntersectionObserver;
    delete (window as any).IntersectionObserver;

    const fallbackLoader = new LazyLoader();
    fallbackLoader.observe(mockElement, mockCallback);

    // Should call callback immediately as fallback
    expect(mockCallback).toHaveBeenCalled();

    // Restore IntersectionObserver
    window.IntersectionObserver = originalIO;
  });
});

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({
      maxSize: 3,
      maxAge: 1000,
      maxMemory: 1024,
    });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should evict least recently used items when at capacity', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Should evict key1

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should handle TTL expiration', async () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should provide cache statistics', () => {
    cache.set('key1', 'value1', 100);
    cache.set('key2', 'value2', 200);

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.memoryUsage).toBe(300);
  });

  it('should cleanup expired entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    // Manually expire entries by setting old timestamp
    (cache as any).cache.get('key1').timestamp = Date.now() - 2000;

    const cleaned = cache.cleanup();
    expect(cleaned).toBe(1);
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });
});

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager(10, 5); // 10MB, 5 minutes
  });

  afterEach(() => {
    memoryManager.destroy();
  });

  it('should track resources', () => {
    const mockResource = { data: 'test' };
    memoryManager.track('test-id', 'multimedia', mockResource, 1024);

    const stats = memoryManager.getStats();
    expect(stats.totalResources).toBe(1);
    expect(stats.estimatedMemory).toBe(1024);
    expect(stats.resourcesByType.multimedia).toBe(1);
  });

  it('should cleanup specific resources', () => {
    const mockResource = { data: 'test' };
    memoryManager.track('test-id', 'multimedia', mockResource, 1024);

    const cleaned = memoryManager.cleanup('test-id');
    expect(cleaned).toBe(true);

    const stats = memoryManager.getStats();
    expect(stats.totalResources).toBe(0);
  });

  it('should cleanup resources by type', () => {
    memoryManager.track('test-1', 'multimedia', {}, 1024);
    memoryManager.track('test-2', 'chart', {}, 1024);
    memoryManager.track('test-3', 'multimedia', {}, 1024);

    const cleaned = memoryManager.cleanupByType('multimedia');
    expect(cleaned).toBe(2);

    const stats = memoryManager.getStats();
    expect(stats.totalResources).toBe(1);
    expect(stats.resourcesByType.chart).toBe(1);
  });

  it('should detect high memory usage', () => {
    // Track resources that exceed 80% of limit
    memoryManager.track('test-1', 'multimedia', {}, 9 * 1024 * 1024); // 9MB

    expect(memoryManager.isMemoryHigh()).toBe(true);
  });

  it('should cleanup old resources', () => {
    memoryManager.track('test-1', 'multimedia', {}, 1024);
    
    // Manually set old timestamp
    const resources = (memoryManager as any).resources;
    resources.get('test-1').timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

    const cleaned = memoryManager.cleanupOldResources();
    expect(cleaned).toBe(1);
  });
});

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor();
  });

  it('should calculate performance score', () => {
    const score = performanceMonitor.getPerformanceScore();
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should detect device capabilities', () => {
    const metrics = performanceMonitor.getMetrics();
    expect(metrics).toHaveProperty('deviceMemory');
    expect(metrics).toHaveProperty('hardwareConcurrency');
    expect(metrics).toHaveProperty('performanceScore');
  });

  it('should generate appropriate configuration', () => {
    const config = performanceMonitor.getConfig();
    expect(config).toHaveProperty('enableLazyLoading');
    expect(config).toHaveProperty('enableCaching');
    expect(config).toHaveProperty('maxConcurrentLoads');
    expect(config).toHaveProperty('enableAnimations');
  });

  it('should provide multimedia settings', () => {
    const settings = performanceMonitor.getMultimediaSettings();
    expect(settings).toHaveProperty('maxImageSize');
    expect(settings).toHaveProperty('enableVideoPreload');
    expect(settings).toHaveProperty('compressionQuality');
  });

  it('should provide chart settings', () => {
    const settings = performanceMonitor.getChartSettings();
    expect(settings).toHaveProperty('maxDataPoints');
    expect(settings).toHaveProperty('enableAnimations');
    expect(settings).toHaveProperty('enableInteractions');
  });

  it('should detect low-end devices', () => {
    // Mock low-end device
    Object.defineProperty(window, 'navigator', {
      value: {
        deviceMemory: 1, // 1GB RAM
        hardwareConcurrency: 1, // Single core
        connection: { effectiveType: '2g' },
      },
      writable: true,
    });

    const lowEndMonitor = new PerformanceMonitor();
    expect(lowEndMonitor.isLowEndDevice()).toBe(true);
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    cacheManager.destroy();
  });

  it('should cache and retrieve multimedia content', async () => {
    const mockBlob = new Blob(['test data'], { type: 'image/jpeg' });
    await cacheManager.setMultimedia('test-url', mockBlob, 'image', 1024);

    const cached = await cacheManager.getMultimedia('test-url');
    expect(cached).toBeTruthy();
    expect(cached?.data).toBe(mockBlob);
    expect(cached?.type).toBe('image');
  });

  it('should cache and retrieve processed data', async () => {
    const testData = { labels: ['A', 'B'], datasets: [] };
    await cacheManager.setData('test-key', testData, 'chart-data');

    const cached = await cacheManager.getData('test-key');
    expect(cached).toBeTruthy();
    expect(cached?.data).toEqual(testData);
  });

  it('should provide cache statistics', async () => {
    await cacheManager.setMultimedia('url1', new Blob(['test']), 'image', 1024);
    await cacheManager.setData('key1', { test: 'data' }, 'chart-data');

    const stats = cacheManager.getStats();
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

  it('should clear cache by type', async () => {
    await cacheManager.setMultimedia('url1', new Blob(['test']), 'image', 1024);
    await cacheManager.setMultimedia('url2', new Blob(['test']), 'video', 1024);
    await cacheManager.setData('key1', {}, 'chart-data');

    const cleared = cacheManager.clearByType('image');
    expect(cleared).toBeGreaterThan(0);
  });

  it('should handle cache enable/disable', () => {
    cacheManager.setEnabled(false);
    
    // Should not cache when disabled
    cacheManager.setMultimedia('test-url', new Blob(['test']), 'image', 1024);
    
    const stats = cacheManager.getStats();
    expect(stats.totalEntries).toBe(0);
  });
});

describe('Integration Tests', () => {
  it('should work together for performance optimization', async () => {
    const performanceMonitor = new PerformanceMonitor();
    const cacheManager = new CacheManager();
    const memoryManager = new MemoryManager();
    const lazyLoader = new LazyLoader();

    // Test performance-aware caching
    const config = performanceMonitor.getConfig();
    if (config.enableCaching) {
      await cacheManager.setMultimedia('test-url', new Blob(['test']), 'image', 1024);
      const cached = await cacheManager.getMultimedia('test-url');
      expect(cached).toBeTruthy();
    }

    // Test memory management
    memoryManager.track('test-resource', 'multimedia', {}, 1024);
    const stats = memoryManager.getStats();
    expect(stats.totalResources).toBe(1);

    // Test lazy loading
    const mockElement = document.createElement('div');
    const mockCallback = vi.fn();
    lazyLoader.observe(mockElement, mockCallback);

    // Cleanup
    memoryManager.destroy();
    cacheManager.destroy();
    lazyLoader.disconnect();
  });
});