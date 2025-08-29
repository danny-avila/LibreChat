/**
 * Performance Optimization Utilities
 * Centralized exports for all performance-related utilities
 */

export { default as LazyLoader, globalLazyLoader } from './LazyLoader';
export { default as LRUCache } from './LRUCache';
export { default as MemoryManager, globalMemoryManager } from './MemoryManager';
export { default as PerformanceMonitor, globalPerformanceMonitor } from './PerformanceMonitor';
export { default as CacheManager, globalCacheManager } from './CacheManager';

// Security and compatibility utilities
export * from './SecurityUtils';
export * from './BrowserCompatibility';

// Accessibility utilities
export * from './AccessibilityUtils';

// Re-export placeholder components
export * from '../components/PlaceholderComponents';

// Re-export compatibility warning components
export * from '../components/CompatibilityWarning';

// Message integration utilities
export { MessageIntegration } from './MessageIntegration';

// Types for performance utilities
export interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableCaching: boolean;
  maxConcurrentLoads: number;
  imageQuality: 'high' | 'medium' | 'low';
  enableAnimations: boolean;
  enableTTS: boolean;
  enableCharts: boolean;
  enableWidgets: boolean;
}

export interface PerformanceMetrics {
  memoryInfo?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connectionType?: string;
  isLowEndDevice: boolean;
  performanceScore: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  memoryUsage: number;
  cachesByType: Record<string, number>;
}

export interface MemoryStats {
  totalResources: number;
  estimatedMemory: number;
  resourcesByType: Record<string, number>;
  oldestResource: number;
}

// Utility functions for performance optimization
export const performanceUtils = {
  /**
   * Check if a feature should be enabled based on current performance
   */
  shouldEnableFeature: (feature: keyof PerformanceConfig): boolean => {
    return globalPerformanceMonitor.shouldEnable(feature);
  },

  /**
   * Get recommended settings for multimedia content
   */
  getMultimediaSettings: () => {
    return globalPerformanceMonitor.getMultimediaSettings();
  },

  /**
   * Get recommended settings for charts
   */
  getChartSettings: () => {
    return globalPerformanceMonitor.getChartSettings();
  },

  /**
   * Check if device is low-end
   */
  isLowEndDevice: (): boolean => {
    return globalPerformanceMonitor.isLowEndDevice();
  },

  /**
   * Get current performance score
   */
  getPerformanceScore: (): number => {
    return globalPerformanceMonitor.getPerformanceScore();
  },

  /**
   * Force cleanup of all cached resources
   */
  cleanupAllResources: (): void => {
    globalMemoryManager.cleanupOldResources();
    globalCacheManager.cleanup();
  },

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats: () => {
    return {
      performance: globalPerformanceMonitor.getMetrics(),
      cache: globalCacheManager.getStats(),
      memory: globalMemoryManager.getStats(),
      lazyLoader: globalLazyLoader.getStats(),
    };
  },
};