/**
 * Advanced Browser Compatibility Tests
 * 
 * Comprehensive tests for browser compatibility detection,
 * feature support, and fallback mechanisms across different
 * browsers and environments.
 */

import {
  detectBrowserCapabilities,
  checkTTSCompatibility,
  checkChartCompatibility,
  checkWidgetCompatibility,
  checkMultimediaCompatibility,
  checkPerformanceCompatibility,
  getBrowserInfo,
  generateCompatibilityReport,
  getFeatureName,
} from '../utils/BrowserCompatibility';

// Mock different browser environments
const createBrowserMock = (userAgent: string, features: Partial<Window> = {}) => {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });

  // Apply feature mocks
  Object.keys(features).forEach(key => {
    if (features[key as keyof Window] === undefined) {
      delete (window as any)[key];
    } else {
      (window as any)[key] = features[key as keyof Window];
    }
  });
};

describe('Advanced Browser Compatibility Tests', () => {
  const originalUserAgent = navigator.userAgent;
  const originalWindow = { ...window };

  beforeEach(() => {
    // Reset window object
    Object.keys(originalWindow).forEach(key => {
      if (!(key in window)) {
        (window as any)[key] = (originalWindow as any)[key];
      }
    });
  });

  afterEach(() => {
    // Restore original user agent
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });

    // Clean up window modifications
    ['speechSynthesis', 'SpeechSynthesisUtterance', 'Worker', 'IntersectionObserver', 
     'customElements', 'WebAssembly'].forEach(prop => {
      if (prop in originalWindow) {
        (window as any)[prop] = (originalWindow as any)[prop];
      } else {
        delete (window as any)[prop];
      }
    });
  });

  describe('Browser Detection Edge Cases', () => {
    it('should detect Chrome on different platforms', () => {
      const chromeUserAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      ];

      chromeUserAgents.forEach(ua => {
        createBrowserMock(ua);
        const info = getBrowserInfo();
        expect(info.name).toBe('Chrome');
        expect(info.version).toBe('91');
      });
    });

    it('should detect Firefox on different platforms', () => {
      const firefoxUserAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Mobile; rv:89.0) Gecko/89.0 Firefox/89.0',
      ];

      firefoxUserAgents.forEach(ua => {
        createBrowserMock(ua);
        const info = getBrowserInfo();
        expect(info.name).toBe('Firefox');
        expect(info.version).toBe('89');
      });
    });

    it('should detect Safari on different platforms', () => {
      const safariUserAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      ];

      safariUserAgents.forEach(ua => {
        createBrowserMock(ua);
        const info = getBrowserInfo();
        expect(info.name).toBe('Safari');
        expect(info.version).toBe('14');
      });
    });

    it('should detect Edge (Chromium) correctly', () => {
      const edgeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59';
      
      createBrowserMock(edgeUserAgent);
      const info = getBrowserInfo();
      expect(info.name).toBe('Edge');
      expect(info.version).toBe('91');
    });

    it('should detect legacy Edge correctly', () => {
      const legacyEdgeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041';
      
      createBrowserMock(legacyEdgeUserAgent);
      const info = getBrowserInfo();
      expect(info.name).toBe('Edge');
      expect(info.version).toBe('18');
    });

    it('should handle unknown browsers gracefully', () => {
      const unknownUserAgent = 'CustomBrowser/1.0 (Unknown Platform)';
      
      createBrowserMock(unknownUserAgent);
      const info = getBrowserInfo();
      expect(info.name).toBe('Unknown');
      expect(info.version).toBe('Unknown');
    });

    it('should detect mobile devices correctly', () => {
      const mobileUserAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Safari/537.36', // Tablet
      ];

      mobileUserAgents.forEach((ua, index) => {
        createBrowserMock(ua);
        const info = getBrowserInfo();
        expect(info.isMobile).toBe(true);
        
        if (index === 0) { // iPhone
          expect(info.isTablet).toBe(false);
        } else if (index === 2) { // Android tablet
          expect(info.isTablet).toBe(true);
        }
      });
    });
  });

  describe('Feature Detection Edge Cases', () => {
    it('should handle partial Web Speech API support', () => {
      // Only speechSynthesis available, no SpeechSynthesisUtterance
      createBrowserMock('Chrome/91.0', {
        speechSynthesis: {},
        SpeechSynthesisUtterance: undefined,
      });

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(false);

      const ttsCompat = checkTTSCompatibility();
      expect(ttsCompat.isSupported).toBe(false);
      expect(ttsCompat.missingFeatures).toContain('speechSynthesis');
    });

    it('should handle broken Canvas implementation', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue(null), // Broken implementation
      };
      
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.canvas).toBe(false);

      const chartCompat = checkChartCompatibility();
      expect(chartCompat.isSupported).toBe(false);
    });

    it('should handle WebGL context creation failures', () => {
      const mockCanvas = {
        getContext: jest.fn((type) => {
          if (type === 'webgl' || type === 'experimental-webgl') {
            return null; // WebGL not available
          }
          return {}; // 2D context available
        }),
      };
      
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.canvas).toBe(true); // 2D canvas works
      expect(capabilities.webGL).toBe(false); // WebGL doesn't work
    });

    it('should handle Web Workers with limited support', () => {
      // Mock Worker that throws on construction
      createBrowserMock('Chrome/91.0', {
        Worker: class MockWorker {
          constructor() {
            throw new Error('Worker construction failed');
          }
        } as any,
      });

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webWorkers).toBe(false);

      const widgetCompat = checkWidgetCompatibility();
      expect(widgetCompat.isSupported).toBe(false);
    });

    it('should handle IntersectionObserver polyfill scenarios', () => {
      // Mock polyfilled IntersectionObserver
      createBrowserMock('IE/11.0', {
        IntersectionObserver: class MockIntersectionObserver {
          constructor() {
            // Polyfill marker
            (this as any).__polyfilled = true;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        } as any,
      });

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.intersectionObserver).toBe(true);
    });
  });

  describe('Legacy Browser Support', () => {
    it('should handle Internet Explorer 11', () => {
      const ie11UserAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko';
      
      createBrowserMock(ie11UserAgent, {
        speechSynthesis: undefined,
        SpeechSynthesisUtterance: undefined,
        Worker: undefined,
        IntersectionObserver: undefined,
        customElements: undefined,
        WebAssembly: undefined,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Internet Explorer');
      expect(info.version).toBe('11');

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(false);
      expect(capabilities.webWorkers).toBe(false);
      expect(capabilities.intersectionObserver).toBe(false);
      expect(capabilities.customElements).toBe(false);
      expect(capabilities.webAssembly).toBe(false);

      const report = generateCompatibilityReport();
      expect(report.featureSupport.tts.isSupported).toBe(false);
      expect(report.featureSupport.widgets.isSupported).toBe(false);
    });

    it('should handle old Chrome versions', () => {
      const oldChromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36';
      
      createBrowserMock(oldChromeUserAgent, {
        speechSynthesis: undefined, // Not available in Chrome 45
        IntersectionObserver: undefined, // Not available in Chrome 45
        customElements: undefined, // Not available in Chrome 45
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Chrome');
      expect(info.version).toBe('45');

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(false);
      expect(capabilities.intersectionObserver).toBe(false);
      expect(capabilities.customElements).toBe(false);
    });

    it('should handle old Firefox versions', () => {
      const oldFirefoxUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:40.0) Gecko/20100101 Firefox/40.0';
      
      createBrowserMock(oldFirefoxUserAgent, {
        speechSynthesis: undefined,
        IntersectionObserver: undefined,
        customElements: undefined,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Firefox');
      expect(info.version).toBe('40');
    });

    it('should handle old Safari versions', () => {
      const oldSafariUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/601.7.8 (KHTML, like Gecko) Version/9.1.3 Safari/601.7.8';
      
      createBrowserMock(oldSafariUserAgent, {
        speechSynthesis: undefined,
        IntersectionObserver: undefined,
        customElements: undefined,
        WebAssembly: undefined,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Safari');
      expect(info.version).toBe('9');
    });
  });

  describe('Mobile Browser Compatibility', () => {
    it('should handle iOS Safari limitations', () => {
      const iosSafariUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1';
      
      createBrowserMock(iosSafariUserAgent, {
        speechSynthesis: {}, // Available but limited
        Worker: undefined, // Not available in older iOS
        WebAssembly: undefined, // Not available in iOS 12
      });

      const info = getBrowserInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isTablet).toBe(false);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(true);
      expect(capabilities.webWorkers).toBe(false);
      expect(capabilities.webAssembly).toBe(false);
    });

    it('should handle Android Chrome limitations', () => {
      const androidChromeUserAgent = 'Mozilla/5.0 (Linux; Android 7.0; SM-G930V Build/NRD90M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Mobile Safari/537.36';
      
      createBrowserMock(androidChromeUserAgent, {
        speechSynthesis: {}, // Available
        Worker: {}, // Available
        IntersectionObserver: undefined, // Not available in Chrome 59
      });

      const info = getBrowserInfo();
      expect(info.isMobile).toBe(true);
      expect(info.name).toBe('Chrome');
      expect(info.version).toBe('59');

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(true);
      expect(capabilities.webWorkers).toBe(true);
      expect(capabilities.intersectionObserver).toBe(false);
    });

    it('should handle Samsung Internet browser', () => {
      const samsungInternetUserAgent = 'Mozilla/5.0 (Linux; Android 9; SAMSUNG SM-G960F Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/10.1 Chrome/71.0.3578.99 Mobile Safari/537.36';
      
      createBrowserMock(samsungInternetUserAgent);

      const info = getBrowserInfo();
      expect(info.isMobile).toBe(true);
      // Should detect as Samsung Internet or Chrome-based
      expect(['Samsung Internet', 'Chrome', 'Unknown']).toContain(info.name);
    });
  });

  describe('Feature Compatibility Matrix', () => {
    it('should provide accurate compatibility for modern browsers', () => {
      createBrowserMock('Chrome/91.0', {
        speechSynthesis: {},
        SpeechSynthesisUtterance: class {},
        Worker: class {},
        IntersectionObserver: class {},
        customElements: {},
        WebAssembly: {},
      });

      const report = generateCompatibilityReport();
      
      expect(report.featureSupport.tts.isSupported).toBe(true);
      expect(report.featureSupport.charts.isSupported).toBe(true);
      expect(report.featureSupport.widgets.isSupported).toBe(true);
      expect(report.featureSupport.multimedia.isSupported).toBe(true);
      expect(report.featureSupport.performance.isSupported).toBe(true);
    });

    it('should provide fallback recommendations for limited browsers', () => {
      createBrowserMock('IE/11.0', {
        speechSynthesis: undefined,
        Worker: undefined,
        IntersectionObserver: undefined,
      });

      const report = generateCompatibilityReport();
      
      expect(report.featureSupport.tts.isSupported).toBe(false);
      expect(report.featureSupport.tts.fallbackMessage).toContain('not supported');
      
      expect(report.featureSupport.widgets.isSupported).toBe(false);
      expect(report.featureSupport.widgets.fallbackMessage).toContain('modern browser features');
      
      expect(report.featureSupport.performance.isSupported).toBe(true);
      expect(report.featureSupport.performance.fallbackMessage).toContain('optimizations are not available');
    });
  });

  describe('Performance Considerations', () => {
    it('should detect low-end devices', () => {
      // Mock low-end device characteristics
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 1, // 1GB RAM
        configurable: true,
      });
      
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 2, // Dual core
        configurable: true,
      });

      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '2g' },
        configurable: true,
      });

      const capabilities = detectBrowserCapabilities();
      const performanceCompat = checkPerformanceCompatibility();
      
      expect(performanceCompat.isSupported).toBe(true);
      expect(performanceCompat.fallbackMessage).toContain('optimizations are not available');
    });

    it('should detect high-end devices', () => {
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 8, // 8GB RAM
        configurable: true,
      });
      
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 8, // Octa core
        configurable: true,
      });

      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '4g' },
        configurable: true,
      });

      const performanceCompat = checkPerformanceCompatibility();
      
      expect(performanceCompat.isSupported).toBe(true);
      expect(performanceCompat.missingFeatures).toHaveLength(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted navigator object', () => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { throw new Error('Navigator access denied'); },
        configurable: true,
      });

      expect(() => getBrowserInfo()).not.toThrow();
      const info = getBrowserInfo();
      expect(info.name).toBe('Unknown');
    });

    it('should handle missing window properties gracefully', () => {
      // Remove all enhanced content related APIs
      delete (window as any).speechSynthesis;
      delete (window as any).SpeechSynthesisUtterance;
      delete (window as any).Worker;
      delete (window as any).IntersectionObserver;
      delete (window as any).customElements;
      delete (window as any).WebAssembly;

      expect(() => detectBrowserCapabilities()).not.toThrow();
      const capabilities = detectBrowserCapabilities();
      
      expect(capabilities.speechSynthesis).toBe(false);
      expect(capabilities.webWorkers).toBe(false);
      expect(capabilities.intersectionObserver).toBe(false);
      expect(capabilities.customElements).toBe(false);
      expect(capabilities.webAssembly).toBe(false);
    });

    it('should handle feature detection in restricted environments', () => {
      // Mock restricted environment (e.g., iframe with limited permissions)
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.canvas).toBe(false);
      expect(capabilities.webGL).toBe(false);

      document.createElement = originalCreateElement;
    });
  });

  describe('Feature Name Mapping', () => {
    it('should provide user-friendly names for all features', () => {
      const features = [
        'speechSynthesis',
        'webGL',
        'canvas',
        'webWorkers',
        'intersectionObserver',
        'customElements',
        'es6Modules',
        'webAssembly',
      ];

      features.forEach(feature => {
        const friendlyName = getFeatureName(feature);
        expect(friendlyName).toBeDefined();
        expect(friendlyName).not.toBe('');
        expect(typeof friendlyName).toBe('string');
      });
    });

    it('should handle unknown feature names', () => {
      const unknownFeature = 'unknownFeatureXYZ';
      const friendlyName = getFeatureName(unknownFeature);
      expect(friendlyName).toBe(unknownFeature);
    });
  });

  describe('Compatibility Report Generation', () => {
    it('should generate comprehensive reports', () => {
      const report = generateCompatibilityReport();
      
      expect(report).toHaveProperty('browser');
      expect(report).toHaveProperty('capabilities');
      expect(report).toHaveProperty('featureSupport');
      
      expect(report.browser).toHaveProperty('name');
      expect(report.browser).toHaveProperty('version');
      expect(report.browser).toHaveProperty('isMobile');
      expect(report.browser).toHaveProperty('isTablet');
      
      expect(report.featureSupport).toHaveProperty('tts');
      expect(report.featureSupport).toHaveProperty('charts');
      expect(report.featureSupport).toHaveProperty('widgets');
      expect(report.featureSupport).toHaveProperty('multimedia');
      expect(report.featureSupport).toHaveProperty('performance');
    });

    it('should include fallback messages for unsupported features', () => {
      createBrowserMock('IE/11.0', {
        speechSynthesis: undefined,
        Worker: undefined,
      });

      const report = generateCompatibilityReport();
      
      expect(report.featureSupport.tts.fallbackMessage).toBeDefined();
      expect(report.featureSupport.widgets.fallbackMessage).toBeDefined();
    });
  });
});