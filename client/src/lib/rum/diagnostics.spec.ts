import type { FCPMetricWithAttribution } from 'web-vitals/attribution';
import {
  emitNavigationTiming,
  flushEarlyRumQueue,
  reportSpaRouteChange,
  testExports,
} from './diagnostics';

describe('rum diagnostics', () => {
  const addAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    testExports.resetDiagnosticsState();
    window.history.replaceState({}, '', '/c/65a5e0a7d1c2b3a4f5e6d789?token=secret#hash');
    window.__lcRumQueue = undefined;
    jest.spyOn(performance, 'now').mockReturnValue(1234.4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits sanitized navigation timing attributes', () => {
    Object.defineProperty(performance, 'getEntriesByType', {
      configurable: true,
      value: jest.fn(),
    });
    jest.spyOn(performance, 'getEntriesByType').mockReturnValue([
      {
        name: 'https://example.com/c/65a5e0a7d1c2b3a4f5e6d789?token=secret',
        type: 'navigate',
        redirectCount: 1,
        redirectStart: 10.2,
        redirectEnd: 20.7,
        workerStart: 0,
        fetchStart: 10900.3,
        requestStart: 10905.3,
        responseStart: 10990.8,
        responseEnd: 10991.7,
        domInteractive: 11011.1,
        loadEventEnd: 11140.5,
        nextHopProtocol: 'h2',
        transferSize: 1024,
      } as PerformanceNavigationTiming,
    ]);

    emitNavigationTiming({ addAction }, '/c/:conversationId');

    expect(addAction).toHaveBeenCalledWith(
      'navigation-timing',
      expect.objectContaining({
        initialPath: '/c/:conversationId',
        currentPath: '/c/:conversationId',
        currentRoute: '/c/:conversationId',
        navType: 'navigate',
        redirectCount: 1,
        redirectStart: 10,
        redirectEnd: 21,
        fetchStart: 10900,
        responseStart: 10991,
        nextHopProtocol: 'h2',
        transferSize: 1024,
      }),
    );
    expect(addAction.mock.calls[0][1]).not.toEqual(expect.objectContaining({ token: 'secret' }));
  });

  it('flushes early queued lifecycle events once', () => {
    window.__lcRumQueue = [
      {
        type: 'sw-controller',
        at: 2.2,
        visibilityState: 'hidden',
        attributes: {
          scriptPath: '/service-worker.js',
          fullUrl: 'https://example.com/c/secret',
          ignored: { nested: true },
        },
      },
    ];

    flushEarlyRumQueue({ addAction });
    flushEarlyRumQueue({ addAction });

    expect(addAction).toHaveBeenCalledTimes(1);
    expect(addAction).toHaveBeenCalledWith('early-sw-controller', {
      at: 2,
      visibilityState: 'hidden',
      scriptPath: '/service-worker.js',
      fullPath: '/c/:conversationId',
    });
    expect(window.__lcRumQueue).toEqual([]);
  });

  it('reports normalized SPA route changes', () => {
    reportSpaRouteChange({ addAction }, '/login', '/c/65a5e0a7d1c2b3a4f5e6d789');

    expect(addAction).toHaveBeenCalledWith('spa-route-change', {
      fromPath: '/login',
      toPath: '/c/:conversationId',
      pageElapsedMs: 1234,
      visibilityState: 'visible',
    });
  });

  it('builds FCP attribution from web-vitals attribution metrics', () => {
    const metric = {
      name: 'FCP',
      value: 11568.4,
      rating: 'poor',
      delta: 11568.4,
      id: 'v1-123',
      navigationType: 'navigate',
      entries: [],
      attribution: {
        timeToFirstByte: 10955.4,
        firstByteToFCP: 613,
        loadState: 'complete',
        fcpEntry: { startTime: 11568.4 },
        navigationEntry: {
          name: 'https://example.com/c/new?orgId=secret',
          type: 'navigate',
          redirectCount: 0,
          workerStart: 300,
          fetchStart: 10866,
          requestStart: 10870,
          responseStart: 10955,
          responseEnd: 10956,
          activationStart: 0,
        },
      },
    } as unknown as FCPMetricWithAttribution;

    expect(testExports.fcpAttributes(metric, '/c/:conversationId')).toEqual(
      expect.objectContaining({
        currentPath: '/c/:conversationId',
        currentRoute: '/c/:conversationId',
        fcp: 11568,
        fcpEntryStart: 11568,
        timeToFirstByte: 10955,
        firstByteToFCP: 613,
        loadState: 'complete',
        navigationType: 'navigate',
        initialPath: '/c/new',
        workerStart: 300,
        fetchStart: 10866,
        responseStart: 10955,
      }),
    );
  });
});
