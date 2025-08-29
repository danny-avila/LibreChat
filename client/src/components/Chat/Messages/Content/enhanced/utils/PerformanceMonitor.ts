/**
 * Performance monitoring and fallback system
 * Detects low-memory devices and provides performance optimizations
 */

interface PerformanceMetrics {
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

interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableCaching: boolean;
  maxConcurrentLoads: number;
  imageQuality: 'high' | 'medium' | 'low';
  enableAnimations: boolean;
  enableTTS: boolean;
  enableCharts: boolean;
  enableWidgets: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private config: PerformanceConfig;
  private observers: Array<(config: PerformanceConfig) => void> = [];

  constructor() {
    this.metrics = this.gatherMetrics();
    this.config = this.generateConfig();
    this.startMonitoring();
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current performance configuration
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Check if device is considered low-end
   */
  isLowEndDevice(): boolean {
    return this.metrics.isLowEndDevice;
  }

  /**
   * Get performance score (0-100, higher is better)
   */
  getPerformanceScore(): number {
    return this.metrics.performanceScore;
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(callback: (config: PerformanceConfig) => void): () => void {
    this.observers.push(callback);
    return () => {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Force recalculation of metrics and config
   */
  refresh(): void {
    this.metrics = this.gatherMetrics();
    const newConfig = this.generateConfig();
    
    if (JSON.stringify(newConfig) !== JSON.stringify(this.config)) {
      this.config = newConfig;
      this.notifyObservers();
    }
  }

  /**
   * Check if a feature should be enabled based on performance
   */
  shouldEnable(feature: keyof PerformanceConfig): boolean {
    return this.config[feature] as boolean;
  }

  /**
   * Get recommended settings for multimedia content
   */
  getMultimediaSettings(): {
    maxImageSize: number;
    enableVideoPreload: boolean;
    enableAudioPreload: boolean;
    compressionQuality: number;
  } {
    const isLowEnd = this.isLowEndDevice();
    
    return {
      maxImageSize: isLowEnd ? 1024 : 2048,
      enableVideoPreload: !isLowEnd,
      enableAudioPreload: !isLowEnd,
      compressionQuality: isLowEnd ? 0.7 : 0.9,
    };
  }

  /**
   * Get recommended settings for charts
   */
  getChartSettings(): {
    maxDataPoints: number;
    enableAnimations: boolean;
    enableInteractions: boolean;
  } {
    const score = this.getPerformanceScore();
    
    return {
      maxDataPoints: score > 70 ? 1000 : score > 40 ? 500 : 100,
      enableAnimations: score > 50,
      enableInteractions: score > 30,
    };
  }

  private gatherMetrics(): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      isLowEndDevice: false,
      performanceScore: 100,
    };

    // Memory information
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      metrics.memoryInfo = {
        usedJSHeapSize: memInfo.usedJSHeapSize,
        totalJSHeapSize: memInfo.totalJSHeapSize,
        jsHeapSizeLimit: memInfo.jsHeapSizeLimit,
      };
    }

    // Device memory (if available)
    if ('deviceMemory' in navigator) {
      metrics.deviceMemory = (navigator as any).deviceMemory;
    }

    // Hardware concurrency
    if ('hardwareConcurrency' in navigator) {
      metrics.hardwareConcurrency = navigator.hardwareConcurrency;
    }

    // Connection information
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      metrics.connectionType = connection.effectiveType;
    }

    // Calculate performance score and low-end device detection
    metrics.performanceScore = this.calculatePerformanceScore(metrics);
    metrics.isLowEndDevice = this.detectLowEndDevice(metrics);

    return metrics;
  }

  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    let score = 100;

    // Memory score (40% weight)
    if (metrics.deviceMemory) {
      if (metrics.deviceMemory < 2) score -= 30;
      else if (metrics.deviceMemory < 4) score -= 15;
      else if (metrics.deviceMemory < 8) score -= 5;
    } else if (metrics.memoryInfo) {
      const memoryRatio = metrics.memoryInfo.usedJSHeapSize / metrics.memoryInfo.jsHeapSizeLimit;
      if (memoryRatio > 0.8) score -= 25;
      else if (memoryRatio > 0.6) score -= 15;
      else if (memoryRatio > 0.4) score -= 5;
    }

    // CPU score (30% weight)
    if (metrics.hardwareConcurrency) {
      if (metrics.hardwareConcurrency < 2) score -= 25;
      else if (metrics.hardwareConcurrency < 4) score -= 10;
    }

    // Connection score (30% weight)
    if (metrics.connectionType) {
      switch (metrics.connectionType) {
        case 'slow-2g':
          score -= 30;
          break;
        case '2g':
          score -= 20;
          break;
        case '3g':
          score -= 10;
          break;
        case '4g':
          // No penalty
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private detectLowEndDevice(metrics: PerformanceMetrics): boolean {
    // Device is considered low-end if:
    // - Device memory < 2GB
    // - Hardware concurrency < 2
    // - Performance score < 40
    // - Connection is 2G or slower

    if (metrics.deviceMemory && metrics.deviceMemory < 2) return true;
    if (metrics.hardwareConcurrency && metrics.hardwareConcurrency < 2) return true;
    if (metrics.performanceScore < 40) return true;
    if (metrics.connectionType && ['slow-2g', '2g'].includes(metrics.connectionType)) return true;

    return false;
  }

  private generateConfig(): PerformanceConfig {
    const score = this.metrics.performanceScore;
    const isLowEnd = this.metrics.isLowEndDevice;

    return {
      enableLazyLoading: true, // Always enable lazy loading
      enableCaching: score > 30, // Disable caching on very low-end devices
      maxConcurrentLoads: isLowEnd ? 2 : score > 70 ? 6 : 4,
      imageQuality: isLowEnd ? 'low' : score > 70 ? 'high' : 'medium',
      enableAnimations: score > 50,
      enableTTS: score > 30, // TTS requires some processing power
      enableCharts: score > 40, // Charts can be resource intensive
      enableWidgets: score > 60, // Widgets require good performance
    };
  }

  private startMonitoring(): void {
    // Monitor performance every 30 seconds
    setInterval(() => {
      this.refresh();
    }, 30000);

    // Monitor memory pressure
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        const memoryPressure = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
        
        if (memoryPressure > 0.9) {
          console.warn('High memory pressure detected');
          // Trigger more aggressive cleanup
          this.notifyObservers();
        }
      }, 10000);
    }
  }

  private notifyObservers(): void {
    this.observers.forEach(callback => {
      try {
        callback(this.config);
      } catch (error) {
        console.error('Error in performance monitor observer:', error);
      }
    });
  }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();

export default PerformanceMonitor;