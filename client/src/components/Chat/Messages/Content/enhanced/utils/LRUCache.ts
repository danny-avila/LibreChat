/**
 * LRU (Least Recently Used) Cache implementation
 * Provides efficient caching for multimedia content and computed data
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  size?: number; // Optional size in bytes for memory management
}

interface CacheOptions {
  maxSize: number;
  maxAge?: number; // TTL in milliseconds
  maxMemory?: number; // Maximum memory usage in bytes
  onEvict?: (key: string, value: any) => void;
}

class LRUCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private options: Required<CacheOptions>;
  private currentMemory: number = 0;

  constructor(options: CacheOptions) {
    this.options = {
      maxAge: 30 * 60 * 1000, // 30 minutes default
      maxMemory: 50 * 1024 * 1024, // 50MB default
      onEvict: () => {},
      ...options,
    };
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    // Update access order and count
    this.updateAccessOrder(key);
    entry.accessCount++;
    entry.timestamp = Date.now();

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, size?: number): void {
    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      accessCount: 1,
      size,
    };

    // Check memory constraints
    if (size && this.currentMemory + size > this.options.maxMemory) {
      this.evictToFitMemory(size);
    }

    // Check size constraints
    if (this.cache.size >= this.options.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    
    if (size) {
      this.currentMemory += size;
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.removeFromAccessOrder(key);
    
    if (entry.size) {
      this.currentMemory -= entry.size;
    }

    this.options.onEvict(key, entry.value);
    return true;
  }

  /**
   * Check if cache has key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    for (const [key, entry] of this.cache.entries()) {
      this.options.onEvict(key, entry.value);
    }
    
    this.cache.clear();
    this.accessOrder = [];
    this.currentMemory = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    memoryUsage: number;
    maxMemory: number;
    hitRate: number;
  } {
    const totalAccess = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      memoryUsage: this.currentMemory,
      maxMemory: this.options.maxMemory,
      hitRate: totalAccess > 0 ? this.cache.size / totalAccess : 0,
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.options.maxAge;
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder[0];
    this.delete(lruKey);
  }

  private evictToFitMemory(requiredSize: number): void {
    while (this.currentMemory + requiredSize > this.options.maxMemory && this.accessOrder.length > 0) {
      this.evictLeastRecentlyUsed();
    }
  }
}

export default LRUCache;