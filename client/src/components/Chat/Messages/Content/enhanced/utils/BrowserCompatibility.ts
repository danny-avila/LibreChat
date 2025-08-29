/**
 * Browser compatibility detection and fallback utilities
 * Detects browser capabilities and provides appropriate fallbacks
 */

export interface BrowserCapabilities {
  speechSynthesis: boolean;
  webGL: boolean;
  canvas: boolean;
  webWorkers: boolean;
  intersectionObserver: boolean;
  customElements: boolean;
  es6Modules: boolean;
  webAssembly: boolean;
}

export interface CompatibilityResult {
  isSupported: boolean;
  missingFeatures: string[];
  fallbackMessage?: string;
}

/**
 * Detects browser capabilities
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  return {
    speechSynthesis: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    webGL: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch {
        return false;
      }
    })(),
    canvas: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext && canvas.getContext('2d'));
      } catch {
        return false;
      }
    })(),
    webWorkers: 'Worker' in window,
    intersectionObserver: 'IntersectionObserver' in window,
    customElements: 'customElements' in window,
    es6Modules: 'noModule' in HTMLScriptElement.prototype,
    webAssembly: 'WebAssembly' in window,
  };
}

/**
 * Checks compatibility for Text-to-Speech features
 */
export function checkTTSCompatibility(): CompatibilityResult {
  const capabilities = detectBrowserCapabilities();
  
  if (!capabilities.speechSynthesis) {
    return {
      isSupported: false,
      missingFeatures: ['speechSynthesis'],
      fallbackMessage: 'Text-to-Speech is not supported in your browser. Please use a modern browser like Chrome, Firefox, Safari, or Edge.',
    };
  }

  return { isSupported: true, missingFeatures: [] };
}

/**
 * Checks compatibility for Chart rendering
 */
export function checkChartCompatibility(): CompatibilityResult {
  const capabilities = detectBrowserCapabilities();
  const missingFeatures: string[] = [];

  if (!capabilities.canvas) {
    missingFeatures.push('canvas');
  }

  if (missingFeatures.length > 0) {
    return {
      isSupported: false,
      missingFeatures,
      fallbackMessage: 'Chart rendering requires Canvas support. Please update your browser or enable Canvas in your browser settings.',
    };
  }

  return { isSupported: true, missingFeatures: [] };
}

/**
 * Checks compatibility for Widget rendering (Sandpack)
 */
export function checkWidgetCompatibility(): CompatibilityResult {
  const capabilities = detectBrowserCapabilities();
  const missingFeatures: string[] = [];

  if (!capabilities.webWorkers) {
    missingFeatures.push('webWorkers');
  }

  if (!capabilities.es6Modules) {
    missingFeatures.push('es6Modules');
  }

  if (missingFeatures.length > 0) {
    return {
      isSupported: false,
      missingFeatures,
      fallbackMessage: 'Interactive widgets require modern browser features (Web Workers, ES6 modules). Please update your browser.',
    };
  }

  return { isSupported: true, missingFeatures: [] };
}

/**
 * Checks compatibility for multimedia content
 */
export function checkMultimediaCompatibility(): CompatibilityResult {
  // Most modern browsers support basic multimedia
  // We can add more specific checks here if needed
  return { isSupported: true, missingFeatures: [] };
}

/**
 * Checks compatibility for performance optimizations
 */
export function checkPerformanceCompatibility(): CompatibilityResult {
  const capabilities = detectBrowserCapabilities();
  const missingFeatures: string[] = [];

  if (!capabilities.intersectionObserver) {
    missingFeatures.push('intersectionObserver');
  }

  if (!capabilities.webWorkers) {
    missingFeatures.push('webWorkers');
  }

  // These are not critical, so we still return supported
  return { 
    isSupported: true, 
    missingFeatures,
    fallbackMessage: missingFeatures.length > 0 
      ? 'Some performance optimizations are not available in your browser, but basic functionality will work.'
      : undefined
  };
}

/**
 * Browser information detection
 */
export function getBrowserInfo(): {
  name: string;
  version: string;
  isMobile: boolean;
  isTablet: boolean;
} {
  const userAgent = navigator.userAgent;
  
  // Detect browser name and version
  let name = 'Unknown';
  let version = 'Unknown';

  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    name = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Firefox')) {
    name = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    name = 'Safari';
    const match = userAgent.match(/Version\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Edg')) {
    name = 'Edge';
    const match = userAgent.match(/Edg\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }

  // Detect device type
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);

  return { name, version, isMobile, isTablet };
}

/**
 * Compatibility warning component props
 */
export interface CompatibilityWarningProps {
  feature: string;
  compatibility: CompatibilityResult;
  showDetails?: boolean;
}

/**
 * Gets user-friendly feature names
 */
export function getFeatureName(feature: string): string {
  const featureNames: Record<string, string> = {
    speechSynthesis: 'Text-to-Speech',
    webGL: 'WebGL',
    canvas: 'Canvas',
    webWorkers: 'Web Workers',
    intersectionObserver: 'Intersection Observer',
    customElements: 'Custom Elements',
    es6Modules: 'ES6 Modules',
    webAssembly: 'WebAssembly',
  };

  return featureNames[feature] || feature;
}

/**
 * Generates compatibility report for debugging
 */
export function generateCompatibilityReport(): {
  browser: ReturnType<typeof getBrowserInfo>;
  capabilities: BrowserCapabilities;
  featureSupport: {
    tts: CompatibilityResult;
    charts: CompatibilityResult;
    widgets: CompatibilityResult;
    multimedia: CompatibilityResult;
    performance: CompatibilityResult;
  };
} {
  return {
    browser: getBrowserInfo(),
    capabilities: detectBrowserCapabilities(),
    featureSupport: {
      tts: checkTTSCompatibility(),
      charts: checkChartCompatibility(),
      widgets: checkWidgetCompatibility(),
      multimedia: checkMultimediaCompatibility(),
      performance: checkPerformanceCompatibility(),
    },
  };
}

/**
 * Logs compatibility information to console (development only)
 */
export function logCompatibilityInfo(): void {
  if (process.env.NODE_ENV === 'development') {
    const report = generateCompatibilityReport();
    console.group('Enhanced Content Compatibility Report');
    console.log('Browser:', report.browser);
    console.log('Capabilities:', report.capabilities);
    console.log('Feature Support:', report.featureSupport);
    console.groupEnd();
  }
}