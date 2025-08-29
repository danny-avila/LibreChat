/**
 * Centralized cache manager for enhanced content
 * Integrates LRU cache, memory management, and performance monitoring
 */

import LRUCache from './LRUCache';
import { globalMemoryManager } from './MemoryManager';
import { globalPerformanceMonitor } from './PerformanceMonitor';

interface CacheEntry {
  data: any;
  type: 'image' | 'video' | 'audio' | 'chart-data' | 'widget-code' | 'tts-voice';
  size: number;
  url?: string;
  metadata?: Record<string, any>;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  memoryUsage: number;
  cachesByType: Record<string, number>;
}

class CacheManager {
  private multimediaCache: LRUCache<CacheEntry>;
  private dataCache: LRUCache<CacheEntry>;
  private hitCount: number = 0;
  private missCount: number = 0;
  private isEnabled: boolean = true;

  constructor() {
    // Initialize caches based on performance
    const performanceConfig = globalPerformanceMonitor.getConfig();
    const isLowEnd = globalPerformanceMonitor.isLowEndDevice();

    this.multimediaCache = new LRUCache<CacheEntry>({
      maxSize: isLowEnd ? 20 : 50,
      maxAge: 30 * 60 * 1000, // 30 minutes
      maxMemory: isLowEnd ? 20 * 1024 * 1024 : 50 * 1024 * 1024, // 20MB or 50MB
      onEvict: this.handleEviction.bind(this),
    });

    this.dataCache = new LRUCache<CacheEntry>({
      maxSize: isLowEnd ? 50 : 100,
      maxAge: 60 * 60 * 1000, // 1 hour
      maxMemory: isLowEnd ? 10 * 1024 * 1024 : 25 * 1024 * 1024, // 10MB or 25MB
      onEvict: this.handleEviction.bind(this),
    });

    this.isEnabled = performanceConfig.enableCaching;
    this.setupPerformanceMonitoring();
  }

  /**
   * Get cached multimedia content
   */
  async getMultimedia(url: string): Promise<CacheEntry | null> {
    if (!this.isEnabled) return null;

    const cached = this.multimediaCache.get(url);
    if (cached) {
      this.hitCount++;
      return cached;
    }

    this.missCount++;
    return null;
  }

  /**
   * Cache multimedia content
   */
  async setMultimedia(url: string, data: any, type: CacheEntry['type'], size?: number): Promise<void> {
    if (!this.isEnabled) return;

    const estimatedSize = size || this.estimateSize(data, type);
    const entry: CacheEntry = {
      data,
      type,
      size: estimatedSize,
      url,
      metadata: {
        cached: Date.now(),
        accessCount: 1,
      },
    };

    this.multimediaCache.set(url, entry, estimatedSize);
    
    // Track in memory manager
    globalMemoryManager.track(
      `cache-multimedia-${url}`,
      'multimedia',
      { entry, url },
      estimatedSize
    );
  }

  /**
   * Get cached data (chart data, parsed content, etc.)
   */
  async getData(key: string): Promise<CacheEntry | null> {
    if (!this.isEnabled) return null;

    const cached = this.dataCache.get(key);
    if (cached) {
      this.hitCount++;
      return cached;
    }

    this.missCount++;
    return null;
  }

  /**
   * Cache processed data
   */
  async setData(key: string, data: any, type: CacheEntry['type'], metadata?: Record<string, any>): Promise<void> {
    if (!this.isEnabled) return;

    const estimatedSize = this.estimateSize(data, type);
    const entry: CacheEntry = {
      data,
      type,
      size: estimatedSize,
      metadata: {
        cached: Date.now(),
        ...metadata,
      },
    };

    this.dataCache.set(key, entry, estimatedSize);
    
    // Track in memory manager
    globalMemoryManager.track(
      `cache-data-${key}`,
      type === 'chart-data' ? 'chart' : 'multimedia',
      { entry, key },
      estimatedSize
    );
  }

  /**
   * Preload multimedia content
   */
  async preloadMultimedia(urls: string[]): Promise<void> {
    if (!this.isEnabled) return;

    const performanceConfig = globalPerformanceMonitor.getConfig();
    const maxConcurrent = performanceConfig.maxConcurrentLoads;
    
    // Process URLs in batches
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const promises = batch.map(url => this.preloadSingleMedia(url));
      
      try {
        await Promise.allSettled(promises);
      } catch (error) {
        console.warn('Error in preload batch:', error);
      }
      
      // Small delay between batches to prevent overwhelming the browser
      if (i + maxConcurrent < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Clear cache by type
   */
  clearByType(type: CacheEntry['type']): number {
    let cleared = 0;

    // Clear from multimedia cache
    for (const [key, entry] of (this.multimediaCache as any).cache.entries()) {
      if (entry.type === type) {
        this.multimediaCache.delete(key);
        cleared++;
      }
    }

    // Clear from data cache
    for (const [key, entry] of (this.dataCache as any).cache.entries()) {
      if (entry.type === type) {
        this.dataCache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const multimediaStats = this.multimediaCache.getStats();
    const dataStats = this.dataCache.getStats();
    
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

    const cachesByType: Record<string, number> = {};
    
    // Count entries by type
    for (const entry of (this.multimediaCache as any).cache.values()) {
      cachesByType[entry.type] = (cachesByType[entry.type] || 0) + 1;
    }
    for (const entry of (this.dataCache as any).cache.values()) {
      cachesByType[entry.type] = (cachesByType[entry.type] || 0) + 1;
    }

    return {
      totalEntries: multimediaStats.size + dataStats.size,
      totalSize: multimediaStats.memoryUsage + dataStats.memoryUsage,
      hitRate,
      memoryUsage: multimediaStats.memoryUsage + dataStats.memoryUsage,
      cachesByType,
    };
  }

  /**
   * Force cleanup of old entries
   */
  cleanup(): { multimedia: number; data: number } {
    const multimediaCleared = this.multimediaCache.cleanup();
    const dataCleared = this.dataCache.cleanup();
    
    return {
      multimedia: multimediaCleared,
      data: dataCleared,
    };
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.multimediaCache.clear();
    this.dataCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Destroy the cache manager
   */
  destroy(): void {
    this.clear();
  }

  private async preloadSingleMedia(url: string): Promise<void> {
    // Check if already cached
    if (this.multimediaCache.has(url)) {
      return;
    }

    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      
      // Only preload if size is reasonable
      const maxSize = globalPerformanceMonitor.isLowEndDevice() ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
      if (contentLength > maxSize) {
        return;
      }

      // Determine type from content-type
      let type: CacheEntry['type'] = 'image';
      if (contentType.startsWith('video/')) type = 'video';
      else if (contentType.startsWith('audio/')) type = 'audio';

      // Fetch the actual content
      const fullResponse = await fetch(url);
      const blob = await fullResponse.blob();
      
      await this.setMultimedia(url, blob, type, blob.size);
      
    } catch (error) {
      console.warn(`Failed to preload ${url}:`, error);
    }
  }

  private estimateSize(data: any, type: CacheEntry['type']): number {
    if (data instanceof Blob) {
      return data.size;
    }
    
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    
    if (typeof data === 'string') {
      return data.length * 2; // Rough estimate for UTF-16
    }
    
    if (typeof data === 'object') {
      try {
        return JSON.stringify(data).length * 2;
      } catch {
        return 1024; // Default estimate
      }
    }
    
    // Default estimates by type
    switch (type) {
      case 'image': return 500 * 1024; // 500KB
      case 'video': return 5 * 1024 * 1024; // 5MB
      case 'audio': return 3 * 1024 * 1024; // 3MB
      case 'chart-data': return 10 * 1024; // 10KB
      case 'widget-code': return 5 * 1024; // 5KB
      case 'tts-voice': return 1024; // 1KB
      default: return 1024;
    }
  }

  private handleEviction(key: string, entry: CacheEntry): void {
    // Clean up from memory manager
    if (entry.url) {
      globalMemoryManager.cleanup(`cache-multimedia-${entry.url}`);
    } else {
      globalMemoryManager.cleanup(`cache-data-${key}`);
    }

    // Clean up blob URLs
    if (entry.data instanceof Blob && entry.url?.startsWith('blob:')) {
      URL.revokeObjectURL(entry.url);
    }
  }

  private setupPerformanceMonitoring(): void {
    // Subscribe to performance changes
    globalPerformanceMonitor.subscribe((config) => {
      this.setEnabled(config.enableCaching);
      
      // Adjust cache sizes based on performance
      if (globalPerformanceMonitor.isLowEndDevice()) {
        // More aggressive cleanup on low-end devices
        this.cleanup();
      }
    });

    // Periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}

// Global cache manager instance
export const globalCacheManager = new CacheManager();

export default CacheManager;