jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/stream', () => ({
  GenerationJobManager: {
    getRuntimeStats: jest.fn(() => null),
  },
}));

jest.mock('~/mcp/oauth/OAuthReconnectionManager', () => ({
  OAuthReconnectionManager: {
    getInstance: jest.fn(() => ({
      getTrackerStats: jest.fn(() => null),
    })),
  },
}));

jest.mock('~/mcp/MCPManager', () => ({
  MCPManager: {
    getInstance: jest.fn(() => ({
      getConnectionStats: jest.fn(() => null),
    })),
  },
}));

import { logger } from '@librechat/data-schemas';
import { memoryDiagnostics } from '../memory';

type MockFn = jest.Mock<void, unknown[]>;

const debugMock = logger.debug as unknown as MockFn;
const infoMock = logger.info as unknown as MockFn;
const warnMock = logger.warn as unknown as MockFn;

function callsContaining(mock: MockFn, substring: string): unknown[][] {
  return mock.mock.calls.filter(
    (args) => typeof args[0] === 'string' && (args[0] as string).includes(substring),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  memoryDiagnostics.stop();

  const snaps = memoryDiagnostics.getSnapshots() as unknown[];
  snaps.length = 0;
});

afterEach(() => {
  memoryDiagnostics.stop();
  jest.useRealTimers();
});

describe('memoryDiagnostics', () => {
  describe('collectSnapshot', () => {
    it('pushes a snapshot with expected shape', () => {
      memoryDiagnostics.collectSnapshot();

      const snaps = memoryDiagnostics.getSnapshots();
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          external: expect.any(Number),
          arrayBuffers: expect.any(Number),
        }),
      );
    });

    it('caps history at 120 snapshots', () => {
      for (let i = 0; i < 130; i++) {
        memoryDiagnostics.collectSnapshot();
      }
      expect(memoryDiagnostics.getSnapshots()).toHaveLength(120);
    });

    it('does not log trend with fewer than 3 snapshots', () => {
      memoryDiagnostics.collectSnapshot();
      memoryDiagnostics.collectSnapshot();

      expect(callsContaining(debugMock, 'Trend')).toHaveLength(0);
    });

    it('skips trend when elapsed time is under 0.1 minutes', () => {
      memoryDiagnostics.collectSnapshot();
      memoryDiagnostics.collectSnapshot();
      memoryDiagnostics.collectSnapshot();

      expect(callsContaining(debugMock, 'Trend')).toHaveLength(0);
    });

    it('logs trend data when enough time has elapsed', () => {
      memoryDiagnostics.collectSnapshot();

      jest.advanceTimersByTime(7_000);
      memoryDiagnostics.collectSnapshot();

      jest.advanceTimersByTime(7_000);
      memoryDiagnostics.collectSnapshot();

      const trendCalls = callsContaining(debugMock, 'Trend');
      expect(trendCalls.length).toBeGreaterThanOrEqual(1);

      const trendPayload = trendCalls[0][1] as Record<string, string>;
      expect(trendPayload).toHaveProperty('rssRate');
      expect(trendPayload).toHaveProperty('heapRate');
      expect(trendPayload.rssRate).toMatch(/MB\/hr$/);
      expect(trendPayload.heapRate).toMatch(/MB\/hr$/);
      expect(trendPayload.rssRate).not.toBe('Infinity MB/hr');
      expect(trendPayload.heapRate).not.toBe('Infinity MB/hr');
    });
  });

  describe('start / stop', () => {
    it('start is idempotent — calling twice does not create two intervals', () => {
      memoryDiagnostics.start();
      memoryDiagnostics.start();

      expect(callsContaining(infoMock, 'Starting')).toHaveLength(1);
    });

    it('stop is idempotent — calling twice does not error', () => {
      memoryDiagnostics.start();
      memoryDiagnostics.stop();
      memoryDiagnostics.stop();

      expect(callsContaining(infoMock, 'Stopped')).toHaveLength(1);
    });

    it('collects an immediate snapshot on start', () => {
      expect(memoryDiagnostics.getSnapshots()).toHaveLength(0);
      memoryDiagnostics.start();
      expect(memoryDiagnostics.getSnapshots().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('forceGC', () => {
    it('returns false and warns when gc is not exposed', () => {
      const origGC = global.gc;
      global.gc = undefined;

      const result = memoryDiagnostics.forceGC();

      expect(result).toBe(false);
      expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('GC not exposed'));

      global.gc = origGC;
    });

    it('calls gc and returns true when gc is exposed', () => {
      const mockGC = jest.fn();
      global.gc = mockGC;

      const result = memoryDiagnostics.forceGC();

      expect(result).toBe(true);
      expect(mockGC).toHaveBeenCalledTimes(1);
      expect(infoMock).toHaveBeenCalledWith(expect.stringContaining('Forced garbage collection'));

      global.gc = undefined;
    });
  });
});
