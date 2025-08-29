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

// Mock browser APIs
const mockWindow = global.window as any;

describe('BrowserCompatibility', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('detectBrowserCapabilities', () => {
    it('should detect speech synthesis support', () => {
      mockWindow.speechSynthesis = {};
      mockWindow.SpeechSynthesisUtterance = class {};

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(true);
    });

    it('should detect missing speech synthesis support', () => {
      delete mockWindow.speechSynthesis;
      delete mockWindow.SpeechSynthesisUtterance;

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.speechSynthesis).toBe(false);
    });

    it('should detect WebGL support', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue({}),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webGL).toBe(true);
    });

    it('should detect missing WebGL support', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue(null),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webGL).toBe(false);
    });

    it('should detect Canvas support', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue({}),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.canvas).toBe(true);
    });

    it('should detect missing Canvas support', () => {
      const mockCanvas = {};
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.canvas).toBe(false);
    });

    it('should detect Web Workers support', () => {
      mockWindow.Worker = class {};

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webWorkers).toBe(true);
    });

    it('should detect missing Web Workers support', () => {
      delete mockWindow.Worker;

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webWorkers).toBe(false);
    });

    it('should detect Intersection Observer support', () => {
      mockWindow.IntersectionObserver = class {};

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.intersectionObserver).toBe(true);
    });

    it('should detect missing Intersection Observer support', () => {
      delete mockWindow.IntersectionObserver;

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.intersectionObserver).toBe(false);
    });

    it('should detect Custom Elements support', () => {
      mockWindow.customElements = {};

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.customElements).toBe(true);
    });

    it('should detect missing Custom Elements support', () => {
      delete mockWindow.customElements;

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.customElements).toBe(false);
    });

    it('should detect ES6 Modules support', () => {
      const mockScript = { noModule: true };
      Object.defineProperty(HTMLScriptElement.prototype, 'noModule', {
        value: true,
        configurable: true,
      });

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.es6Modules).toBe(true);
    });

    it('should detect WebAssembly support', () => {
      mockWindow.WebAssembly = {};

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webAssembly).toBe(true);
    });

    it('should detect missing WebAssembly support', () => {
      delete mockWindow.WebAssembly;

      const capabilities = detectBrowserCapabilities();
      expect(capabilities.webAssembly).toBe(false);
    });
  });

  describe('checkTTSCompatibility', () => {
    it('should return supported when speech synthesis is available', () => {
      mockWindow.speechSynthesis = {};
      mockWindow.SpeechSynthesisUtterance = class {};

      const result = checkTTSCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toEqual([]);
    });

    it('should return unsupported when speech synthesis is missing', () => {
      delete mockWindow.speechSynthesis;
      delete mockWindow.SpeechSynthesisUtterance;

      const result = checkTTSCompatibility();
      expect(result.isSupported).toBe(false);
      expect(result.missingFeatures).toContain('speechSynthesis');
      expect(result.fallbackMessage).toContain('Text-to-Speech is not supported');
    });
  });

  describe('checkChartCompatibility', () => {
    it('should return supported when Canvas is available', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue({}),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const result = checkChartCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toEqual([]);
    });

    it('should return unsupported when Canvas is missing', () => {
      const mockCanvas = {};
      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const result = checkChartCompatibility();
      expect(result.isSupported).toBe(false);
      expect(result.missingFeatures).toContain('canvas');
      expect(result.fallbackMessage).toContain('Chart rendering requires Canvas support');
    });
  });

  describe('checkWidgetCompatibility', () => {
    it('should return supported when all required features are available', () => {
      mockWindow.Worker = class {};
      Object.defineProperty(HTMLScriptElement.prototype, 'noModule', {
        value: true,
        configurable: true,
      });

      const result = checkWidgetCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toEqual([]);
    });

    it('should return unsupported when Web Workers are missing', () => {
      delete mockWindow.Worker;
      Object.defineProperty(HTMLScriptElement.prototype, 'noModule', {
        value: true,
        configurable: true,
      });

      const result = checkWidgetCompatibility();
      expect(result.isSupported).toBe(false);
      expect(result.missingFeatures).toContain('webWorkers');
      expect(result.fallbackMessage).toContain('Interactive widgets require modern browser features');
    });

    it('should return unsupported when ES6 modules are missing', () => {
      mockWindow.Worker = class {};
      Object.defineProperty(HTMLScriptElement.prototype, 'noModule', {
        value: false,
        configurable: true,
      });

      const result = checkWidgetCompatibility();
      expect(result.isSupported).toBe(false);
      expect(result.missingFeatures).toContain('es6Modules');
    });
  });

  describe('checkMultimediaCompatibility', () => {
    it('should always return supported', () => {
      const result = checkMultimediaCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toEqual([]);
    });
  });

  describe('checkPerformanceCompatibility', () => {
    it('should return supported even with missing features', () => {
      delete mockWindow.IntersectionObserver;
      delete mockWindow.Worker;

      const result = checkPerformanceCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toContain('intersectionObserver');
      expect(result.missingFeatures).toContain('webWorkers');
      expect(result.fallbackMessage).toContain('Some performance optimizations are not available');
    });

    it('should return supported with no missing features', () => {
      mockWindow.IntersectionObserver = class {};
      mockWindow.Worker = class {};

      const result = checkPerformanceCompatibility();
      expect(result.isSupported).toBe(true);
      expect(result.missingFeatures).toEqual([]);
      expect(result.fallbackMessage).toBeUndefined();
    });
  });

  describe('getBrowserInfo', () => {
    const originalUserAgent = navigator.userAgent;

    afterEach(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
    });

    it('should detect Chrome browser', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Chrome');
      expect(info.version).toBe('91');
      expect(info.isMobile).toBe(false);
      expect(info.isTablet).toBe(false);
    });

    it('should detect Firefox browser', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Firefox');
      expect(info.version).toBe('89');
    });

    it('should detect Safari browser', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Safari');
      expect(info.version).toBe('14');
    });

    it('should detect Edge browser', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Edge');
      expect(info.version).toBe('91');
    });

    it('should detect mobile devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isTablet).toBe(false);
    });

    it('should detect tablet devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isTablet).toBe(true);
    });

    it('should handle unknown browsers', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Unknown Browser/1.0',
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.name).toBe('Unknown');
      expect(info.version).toBe('Unknown');
    });
  });

  describe('getFeatureName', () => {
    it('should return user-friendly feature names', () => {
      expect(getFeatureName('speechSynthesis')).toBe('Text-to-Speech');
      expect(getFeatureName('webGL')).toBe('WebGL');
      expect(getFeatureName('canvas')).toBe('Canvas');
      expect(getFeatureName('webWorkers')).toBe('Web Workers');
      expect(getFeatureName('intersectionObserver')).toBe('Intersection Observer');
      expect(getFeatureName('customElements')).toBe('Custom Elements');
      expect(getFeatureName('es6Modules')).toBe('ES6 Modules');
      expect(getFeatureName('webAssembly')).toBe('WebAssembly');
    });

    it('should return original name for unknown features', () => {
      expect(getFeatureName('unknownFeature')).toBe('unknownFeature');
    });
  });

  describe('generateCompatibilityReport', () => {
    it('should generate comprehensive compatibility report', () => {
      // Set up some mock capabilities
      mockWindow.speechSynthesis = {};
      mockWindow.SpeechSynthesisUtterance = class {};
      mockWindow.Worker = class {};
      mockWindow.IntersectionObserver = class {};

      const report = generateCompatibilityReport();

      expect(report).toHaveProperty('browser');
      expect(report).toHaveProperty('capabilities');
      expect(report).toHaveProperty('featureSupport');

      expect(report.featureSupport).toHaveProperty('tts');
      expect(report.featureSupport).toHaveProperty('charts');
      expect(report.featureSupport).toHaveProperty('widgets');
      expect(report.featureSupport).toHaveProperty('multimedia');
      expect(report.featureSupport).toHaveProperty('performance');

      expect(report.browser).toHaveProperty('name');
      expect(report.browser).toHaveProperty('version');
      expect(report.browser).toHaveProperty('isMobile');
      expect(report.browser).toHaveProperty('isTablet');
    });
  });

  describe('logCompatibilityInfo', () => {
    const originalEnv = process.env.NODE_ENV;
    const consoleSpy = jest.spyOn(console, 'group').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation();

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      jest.clearAllMocks();
    });

    afterAll(() => {
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('should log compatibility info in development mode', () => {
      process.env.NODE_ENV = 'development';

      const { logCompatibilityInfo } = require('../utils/BrowserCompatibility');
      logCompatibilityInfo();

      expect(consoleSpy).toHaveBeenCalledWith('Enhanced Content Compatibility Report');
      expect(consoleLogSpy).toHaveBeenCalledWith('Browser:', expect.any(Object));
      expect(consoleLogSpy).toHaveBeenCalledWith('Capabilities:', expect.any(Object));
      expect(consoleLogSpy).toHaveBeenCalledWith('Feature Support:', expect.any(Object));
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it('should not log compatibility info in production mode', () => {
      process.env.NODE_ENV = 'production';

      const { logCompatibilityInfo } = require('../utils/BrowserCompatibility');
      logCompatibilityInfo();

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleGroupEndSpy).not.toHaveBeenCalled();
    });
  });
});