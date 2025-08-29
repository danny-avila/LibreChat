/**
 * Lazy loading utility using Intersection Observer API
 * Provides efficient loading of multimedia content when it enters the viewport
 */

interface LazyLoadOptions {
  rootMargin?: string;
  threshold?: number;
  onLoad?: (element: Element) => void;
  onError?: (element: Element, error: Error) => void;
}

interface LazyLoadEntry {
  element: Element;
  callback: () => void;
  loaded: boolean;
}

class LazyLoader {
  private observer: IntersectionObserver | null = null;
  private entries: Map<Element, LazyLoadEntry> = new Map();
  private options: LazyLoadOptions;

  constructor(options: LazyLoadOptions = {}) {
    this.options = {
      rootMargin: '50px',
      threshold: 0.1,
      ...options,
    };

    this.initializeObserver();
  }

  private initializeObserver(): void {
    if (!('IntersectionObserver' in window)) {
      // Fallback for browsers without IntersectionObserver
      console.warn('IntersectionObserver not supported, loading all content immediately');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const lazyEntry = this.entries.get(entry.target);
            if (lazyEntry && !lazyEntry.loaded) {
              try {
                lazyEntry.callback();
                lazyEntry.loaded = true;
                this.observer?.unobserve(entry.target);
                this.options.onLoad?.(entry.target);
              } catch (error) {
                this.options.onError?.(entry.target, error as Error);
              }
            }
          }
        });
      },
      {
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold,
      }
    );
  }

  /**
   * Register an element for lazy loading
   */
  observe(element: Element, callback: () => void): void {
    if (!this.observer) {
      // Fallback: load immediately if no observer
      callback();
      return;
    }

    const entry: LazyLoadEntry = {
      element,
      callback,
      loaded: false,
    };

    this.entries.set(element, entry);
    this.observer.observe(element);
  }

  /**
   * Unregister an element from lazy loading
   */
  unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element);
    }
    this.entries.delete(element);
  }

  /**
   * Clean up all observers and entries
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.entries.clear();
  }

  /**
   * Get loading statistics
   */
  getStats(): { total: number; loaded: number; pending: number } {
    const total = this.entries.size;
    const loaded = Array.from(this.entries.values()).filter(entry => entry.loaded).length;
    return {
      total,
      loaded,
      pending: total - loaded,
    };
  }
}

// Singleton instance for global use
export const globalLazyLoader = new LazyLoader({
  rootMargin: '100px',
  threshold: 0.1,
});

export default LazyLoader;