/**
 * AccessibilityUtils - Utilities for enhanced content accessibility
 * 
 * Provides ARIA labels, keyboard navigation helpers, screen reader support,
 * and focus management utilities for enhanced content components.
 */

export interface AccessibilityConfig {
  enableKeyboardNavigation: boolean;
  enableScreenReaderSupport: boolean;
  enableLiveRegions: boolean;
  enableFocusManagement: boolean;
  announceContentChanges: boolean;
}

export interface AriaLabels {
  // TTS specific
  ttsButton: (text: string, language: string, isPlaying: boolean) => string;
  ttsText: (text: string, language: string) => string;
  ttsStatus: (isPlaying: boolean, text?: string) => string;
  
  // Multimedia specific
  image: (alt?: string) => string;
  video: (title?: string) => string;
  audio: (title?: string) => string;
  multimediaError: (type: string, error: string) => string;
  
  // Chart specific
  chart: (type: string, dataPoints: number, datasets: number) => string;
  chartError: (type: string, error: string) => string;
  
  // Widget specific
  widget: (type: string) => string;
  widgetError: (error: string) => string;
  
  // Code execution specific
  codeBlock: (language: string) => string;
  executeButton: (language: string, isExecuting: boolean) => string;
  codeOutput: (type: 'success' | 'error', executionTime?: number) => string;
}

export interface KeyboardHandlers {
  onEnterOrSpace: (callback: () => void) => (event: React.KeyboardEvent) => void;
  onEscape: (callback: () => void) => (event: React.KeyboardEvent) => void;
  onArrowKeys: (callbacks: {
    up?: () => void;
    down?: () => void;
    left?: () => void;
    right?: () => void;
  }) => (event: React.KeyboardEvent) => void;
}

export interface FocusManager {
  setFocusableElements: (container: HTMLElement) => HTMLElement[];
  trapFocus: (container: HTMLElement) => () => void;
  restoreFocus: (previousElement?: HTMLElement) => void;
  manageFocusOrder: (elements: HTMLElement[]) => void;
}

export interface LiveRegionManager {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  announceStatus: (status: string, priority?: 'polite' | 'assertive') => void;
  clear: () => void;
}

class AccessibilityUtilsClass {
  private config: AccessibilityConfig = {
    enableKeyboardNavigation: true,
    enableScreenReaderSupport: true,
    enableLiveRegions: true,
    enableFocusManagement: true,
    announceContentChanges: true,
  };

  private liveRegionElement: HTMLElement | null = null;
  private statusRegionElement: HTMLElement | null = null;

  constructor() {
    this.initializeLiveRegions();
  }

  /**
   * Initialize ARIA live regions for announcements
   */
  private initializeLiveRegions(): void {
    if (typeof window === 'undefined') return;

    // Create main live region for content announcements
    if (!this.liveRegionElement) {
      this.liveRegionElement = document.createElement('div');
      this.liveRegionElement.setAttribute('aria-live', 'polite');
      this.liveRegionElement.setAttribute('aria-atomic', 'true');
      this.liveRegionElement.setAttribute('class', 'sr-only');
      this.liveRegionElement.setAttribute('id', 'enhanced-content-live-region');
      document.body.appendChild(this.liveRegionElement);
    }

    // Create status region for status updates
    if (!this.statusRegionElement) {
      this.statusRegionElement = document.createElement('div');
      this.statusRegionElement.setAttribute('aria-live', 'assertive');
      this.statusRegionElement.setAttribute('aria-atomic', 'true');
      this.statusRegionElement.setAttribute('class', 'sr-only');
      this.statusRegionElement.setAttribute('id', 'enhanced-content-status-region');
      document.body.appendChild(this.statusRegionElement);
    }
  }

  /**
   * Get accessibility configuration
   */
  getConfig(): AccessibilityConfig {
    return { ...this.config };
  }

  /**
   * Update accessibility configuration
   */
  updateConfig(updates: Partial<AccessibilityConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * ARIA labels for enhanced content elements
   */
  getAriaLabels(): AriaLabels {
    return {
      // TTS specific
      ttsButton: (text: string, language: string, isPlaying: boolean) => {
        if (isPlaying) {
          return `Stop reading "${text}" in ${language}`;
        }
        return `Read "${text}" aloud in ${language}`;
      },
      
      ttsText: (text: string, language: string) => {
        return `Clickable text for speech synthesis: "${text}" in ${language}`;
      },
      
      ttsStatus: (isPlaying: boolean, text?: string) => {
        if (isPlaying && text) {
          return `Currently reading: ${text}`;
        }
        return isPlaying ? 'Text-to-speech is playing' : 'Text-to-speech stopped';
      },

      // Multimedia specific
      image: (alt?: string) => {
        return alt || 'Enhanced content image';
      },
      
      video: (title?: string) => {
        return title ? `Video: ${title}` : 'Enhanced content video';
      },
      
      audio: (title?: string) => {
        return title ? `Audio: ${title}` : 'Enhanced content audio';
      },
      
      multimediaError: (type: string, error: string) => {
        return `Failed to load ${type}: ${error}`;
      },

      // Chart specific
      chart: (type: string, dataPoints: number, datasets: number) => {
        return `${type} chart with ${datasets} dataset${datasets !== 1 ? 's' : ''} and ${dataPoints} data points`;
      },
      
      chartError: (type: string, error: string) => {
        return `Chart error: Failed to render ${type} chart. ${error}`;
      },

      // Widget specific
      widget: (type: string) => {
        return `Interactive ${type} widget in secure sandbox`;
      },
      
      widgetError: (error: string) => {
        return `Widget error: ${error}`;
      },

      // Code execution specific
      codeBlock: (language: string) => {
        return `Code block in ${language} with execution capability`;
      },
      
      executeButton: (language: string, isExecuting: boolean) => {
        if (isExecuting) {
          return `Executing ${language} code, please wait`;
        }
        return `Execute ${language} code`;
      },
      
      codeOutput: (type: 'success' | 'error', executionTime?: number) => {
        const timeStr = executionTime ? ` in ${executionTime}ms` : '';
        return type === 'success' 
          ? `Code execution completed successfully${timeStr}`
          : `Code execution failed${timeStr}`;
      },
    };
  }

  /**
   * Keyboard event handlers
   */
  getKeyboardHandlers(): KeyboardHandlers {
    return {
      onEnterOrSpace: (callback: () => void) => (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          callback();
        }
      },

      onEscape: (callback: () => void) => (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          callback();
        }
      },

      onArrowKeys: (callbacks: {
        up?: () => void;
        down?: () => void;
        left?: () => void;
        right?: () => void;
      }) => (event: React.KeyboardEvent) => {
        switch (event.key) {
          case 'ArrowUp':
            if (callbacks.up) {
              event.preventDefault();
              callbacks.up();
            }
            break;
          case 'ArrowDown':
            if (callbacks.down) {
              event.preventDefault();
              callbacks.down();
            }
            break;
          case 'ArrowLeft':
            if (callbacks.left) {
              event.preventDefault();
              callbacks.left();
            }
            break;
          case 'ArrowRight':
            if (callbacks.right) {
              event.preventDefault();
              callbacks.right();
            }
            break;
        }
      },
    };
  }

  /**
   * Focus management utilities
   */
  getFocusManager(): FocusManager {
    return {
      setFocusableElements: (container: HTMLElement): HTMLElement[] => {
        const focusableSelectors = [
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          'a[href]',
          '[tabindex]:not([tabindex="-1"])',
          '[role="button"]:not([disabled])',
          '[role="link"]:not([disabled])',
        ].join(', ');

        return Array.from(container.querySelectorAll(focusableSelectors));
      },

      trapFocus: (container: HTMLElement): (() => void) => {
        const focusableElements = this.getFocusManager().setFocusableElements(container);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Tab') {
            if (event.shiftKey) {
              // Shift + Tab
              if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement?.focus();
              }
            } else {
              // Tab
              if (document.activeElement === lastElement) {
                event.preventDefault();
                firstElement?.focus();
              }
            }
          }
        };

        container.addEventListener('keydown', handleKeyDown);

        // Return cleanup function
        return () => {
          container.removeEventListener('keydown', handleKeyDown);
        };
      },

      restoreFocus: (previousElement?: HTMLElement): void => {
        if (previousElement && document.contains(previousElement)) {
          previousElement.focus();
        }
      },

      manageFocusOrder: (elements: HTMLElement[]): void => {
        elements.forEach((element, index) => {
          element.setAttribute('tabindex', index === 0 ? '0' : '-1');
        });
      },
    };
  }

  /**
   * Live region manager for screen reader announcements
   */
  getLiveRegionManager(): LiveRegionManager {
    return {
      announce: (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
        if (!this.config.enableLiveRegions) return;

        const region = priority === 'assertive' ? this.statusRegionElement : this.liveRegionElement;
        if (region) {
          // Clear previous content
          region.textContent = '';
          // Add new content after a brief delay to ensure screen readers pick it up
          setTimeout(() => {
            region.textContent = message;
          }, 100);
        }
      },

      announceStatus: (status: string, priority: 'polite' | 'assertive' = 'assertive'): void => {
        if (!this.config.enableLiveRegions) return;
        this.getLiveRegionManager().announce(status, priority);
      },

      clear: (): void => {
        if (this.liveRegionElement) {
          this.liveRegionElement.textContent = '';
        }
        if (this.statusRegionElement) {
          this.statusRegionElement.textContent = '';
        }
      },
    };
  }

  /**
   * Generate alternative text descriptions for multimedia content
   */
  generateAltText(type: 'image' | 'video' | 'audio', url: string, metadata?: any): string {
    const filename = url.split('/').pop()?.split('?')[0] || 'unknown';
    
    switch (type) {
      case 'image':
        return `Image: ${filename}`;
      case 'video':
        return `Video: ${filename}${metadata?.duration ? ` (${metadata.duration})` : ''}`;
      case 'audio':
        return `Audio: ${filename}${metadata?.duration ? ` (${metadata.duration})` : ''}`;
      default:
        return `Media file: ${filename}`;
    }
  }

  /**
   * Generate chart descriptions for screen readers
   */
  generateChartDescription(type: string, data: any): string {
    if (!data || !data.labels || !data.datasets) {
      return `${type} chart with invalid data`;
    }

    const datasetCount = data.datasets.length;
    const dataPointCount = data.labels.length;
    const datasetNames = data.datasets.map((d: any) => d.label).filter(Boolean);

    let description = `${type} chart with ${datasetCount} dataset${datasetCount !== 1 ? 's' : ''} and ${dataPointCount} data points.`;
    
    if (datasetNames.length > 0) {
      description += ` Datasets: ${datasetNames.join(', ')}.`;
    }

    // Add data range information for better context
    if (data.datasets[0]?.data) {
      const values = data.datasets[0].data.filter((v: any) => typeof v === 'number');
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        description += ` Data range: ${min} to ${max}.`;
      }
    }

    return description;
  }

  /**
   * Check if reduced motion is preferred
   */
  prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Check if high contrast is preferred
   */
  prefersHighContrast(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-contrast: high)').matches;
  }

  /**
   * Cleanup live regions on unmount
   */
  cleanup(): void {
    if (this.liveRegionElement && document.contains(this.liveRegionElement)) {
      document.body.removeChild(this.liveRegionElement);
      this.liveRegionElement = null;
    }
    if (this.statusRegionElement && document.contains(this.statusRegionElement)) {
      document.body.removeChild(this.statusRegionElement);
      this.statusRegionElement = null;
    }
  }
}

// Export singleton instance
export const globalAccessibilityUtils = new AccessibilityUtilsClass();

// Export utility functions
export const {
  getConfig: getAccessibilityConfig,
  updateConfig: updateAccessibilityConfig,
  getAriaLabels,
  getKeyboardHandlers,
  getFocusManager,
  getLiveRegionManager,
  generateAltText,
  generateChartDescription,
  prefersReducedMotion,
  prefersHighContrast,
} = globalAccessibilityUtils;