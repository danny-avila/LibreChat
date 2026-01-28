import '@testing-library/jest-dom';

// Mock import.meta.env for Vite compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).importMetaEnv = {
  MODE: 'test',
  DEV: true,
  PROD: false,
};

Object.defineProperty(globalThis, 'import', {
  value: {
    meta: {
      env: {
        MODE: 'test',
        DEV: true,
        PROD: false,
      },
    },
  },
});

// Mock @dicebear modules (ESM-only modules)
jest.mock('@dicebear/core', () => ({
  createAvatar: jest.fn(() => ({
    toDataUri: jest.fn(() => 'data:image/svg+xml;base64,mock'),
  })),
}));

jest.mock('@dicebear/collection', () => ({
  initials: {},
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn().mockReturnValue([]);
  root = null;
  rootMargin = '';
  thresholds = [0];
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

// Mock requestAnimationFrame and cancelAnimationFrame
let rafId = 0;
Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: jest.fn((callback: FrameRequestCallback) => {
    rafId += 1;
    setTimeout(() => callback(performance.now()), 0);
    return rafId;
  }),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: jest.fn(),
});

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === 'object') {
        let result = key;
        Object.entries(options).forEach(([k, v]) => {
          result = result.replace(`{{${k}}}`, String(v));
          result = result.replace(`{${k}}`, String(v));
        });
        return result;
      }
      return key;
    },
    i18n: {
      changeLanguage: jest.fn(),
      language: 'en',
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

// Mock useLocalize hook
jest.mock('~/hooks', () => ({
  ...jest.requireActual('~/hooks'),
  useLocalize: () => (key: string, options?: Record<string, unknown>) => {
    if (options && typeof options === 'object') {
      let result = key;
      Object.entries(options).forEach(([k, v]) => {
        result = result.replace(`{{${k}}}`, String(v));
        result = result.replace(`{${k}}`, String(v));
      });
      return result;
    }
    return key;
  },
  useMediaQuery: jest.fn(() => false),
}));

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
