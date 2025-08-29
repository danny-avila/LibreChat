/**
 * Memory management system for enhanced content rendering
 * Handles cleanup of TTS utterances, chart instances, and sandbox workers
 */

interface ResourceTracker {
  id: string;
  type: 'tts' | 'chart' | 'sandbox' | 'multimedia';
  resource: any;
  timestamp: number;
  memoryEstimate: number;
}

interface MemoryStats {
  totalResources: number;
  estimatedMemory: number;
  resourcesByType: Record<string, number>;
  oldestResource: number;
}

class MemoryManager {
  private resources: Map<string, ResourceTracker> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private maxMemoryEstimate: number;
  private maxAge: number;

  constructor(maxMemoryMB: number = 100, maxAgeMinutes: number = 30) {
    this.maxMemoryEstimate = maxMemoryMB * 1024 * 1024; // Convert to bytes
    this.maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    
    this.startCleanupInterval();
    this.setupMemoryWarnings();
  }

  /**
   * Register a resource for tracking
   */
  track(id: string, type: ResourceTracker['type'], resource: any, memoryEstimate: number = 0): void {
    // Clean up existing resource with same ID
    if (this.resources.has(id)) {
      this.cleanup(id);
    }

    const tracker: ResourceTracker = {
      id,
      type,
      resource,
      timestamp: Date.now(),
      memoryEstimate,
    };

    this.resources.set(id, tracker);

    // Check if we need to free memory
    if (this.getEstimatedMemory() > this.maxMemoryEstimate) {
      this.freeMemory();
    }
  }

  /**
   * Cleanup a specific resource
   */
  cleanup(id: string): boolean {
    const tracker = this.resources.get(id);
    if (!tracker) {
      return false;
    }

    try {
      this.cleanupResource(tracker);
      this.resources.delete(id);
      return true;
    } catch (error) {
      console.warn(`Failed to cleanup resource ${id}:`, error);
      return false;
    }
  }

  /**
   * Cleanup resources by type
   */
  cleanupByType(type: ResourceTracker['type']): number {
    let cleaned = 0;
    
    for (const [id, tracker] of this.resources.entries()) {
      if (tracker.type === type) {
        if (this.cleanup(id)) {
          cleaned++;
        }
      }
    }
    
    return cleaned;
  }

  /**
   * Force cleanup of old resources
   */
  cleanupOldResources(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, tracker] of this.resources.entries()) {
      if (now - tracker.timestamp > this.maxAge) {
        if (this.cleanup(id)) {
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    const resourcesByType: Record<string, number> = {};
    let estimatedMemory = 0;
    let oldestTimestamp = Date.now();

    for (const tracker of this.resources.values()) {
      resourcesByType[tracker.type] = (resourcesByType[tracker.type] || 0) + 1;
      estimatedMemory += tracker.memoryEstimate;
      oldestTimestamp = Math.min(oldestTimestamp, tracker.timestamp);
    }

    return {
      totalResources: this.resources.size,
      estimatedMemory,
      resourcesByType,
      oldestResource: oldestTimestamp,
    };
  }

  /**
   * Check if memory usage is high
   */
  isMemoryHigh(): boolean {
    return this.getEstimatedMemory() > this.maxMemoryEstimate * 0.8;
  }

  /**
   * Get estimated memory usage
   */
  getEstimatedMemory(): number {
    return Array.from(this.resources.values())
      .reduce((total, tracker) => total + tracker.memoryEstimate, 0);
  }

  /**
   * Destroy the memory manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cleanup all resources
    for (const id of this.resources.keys()) {
      this.cleanup(id);
    }
  }

  private cleanupResource(tracker: ResourceTracker): void {
    switch (tracker.type) {
      case 'tts':
        this.cleanupTTS(tracker.resource);
        break;
      case 'chart':
        this.cleanupChart(tracker.resource);
        break;
      case 'sandbox':
        this.cleanupSandbox(tracker.resource);
        break;
      case 'multimedia':
        this.cleanupMultimedia(tracker.resource);
        break;
      default:
        console.warn(`Unknown resource type: ${tracker.type}`);
    }
  }

  private cleanupTTS(utterance: SpeechSynthesisUtterance): void {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    // Remove event listeners if they exist
    utterance.onend = null;
    utterance.onerror = null;
    utterance.onstart = null;
  }

  private cleanupChart(chartInstance: any): void {
    if (chartInstance && typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }
  }

  private cleanupSandbox(sandboxData: any): void {
    // Cleanup sandbox workers or iframe references
    if (sandboxData.worker && typeof sandboxData.worker.terminate === 'function') {
      sandboxData.worker.terminate();
    }
    if (sandboxData.iframe && sandboxData.iframe.parentNode) {
      sandboxData.iframe.parentNode.removeChild(sandboxData.iframe);
    }
  }

  private cleanupMultimedia(mediaData: any): void {
    // Cleanup media elements and blob URLs
    if (mediaData.element) {
      const element = mediaData.element;
      if (element.pause && typeof element.pause === 'function') {
        element.pause();
      }
      element.src = '';
      element.load && element.load();
    }
    
    if (mediaData.blobUrl && mediaData.blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaData.blobUrl);
    }
  }

  private freeMemory(): void {
    // First, cleanup old resources
    this.cleanupOldResources();

    // If still over limit, cleanup least recently used resources
    const sortedResources = Array.from(this.resources.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    while (this.getEstimatedMemory() > this.maxMemoryEstimate && sortedResources.length > 0) {
      const [id] = sortedResources.shift()!;
      this.cleanup(id);
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldResources();
    }, 5 * 60 * 1000);
  }

  private setupMemoryWarnings(): void {
    // Monitor memory usage and warn if high
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        if (memInfo && memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
          console.warn('High memory usage detected, forcing cleanup');
          this.freeMemory();
        }
      }, 30000); // Check every 30 seconds
    }
  }
}

// Global memory manager instance
export const globalMemoryManager = new MemoryManager();

export default MemoryManager;