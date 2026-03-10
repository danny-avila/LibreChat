/**
 * Reconnection storm regression tests for PR #12162.
 *
 * Validates circuit breaker, throttling, cooldown, and timeout fixes using real
 * MCP SDK transports (no mocked stubs). A real StreamableHTTP server is spun up
 * per test suite and MCPConnection talks to it through a genuine HTTP stack.
 */
import http from 'http';
import express from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { OAuthReconnectionTracker } from '~/mcp/oauth/OAuthReconnectionTracker';
import { MCPConnection } from '~/mcp/connection';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface TestServer {
  url: string;
  httpServer: http.Server;
  close: () => Promise<void>;
}

function startMCPServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json());

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  function createServer(): McpServer {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    server.tool('echo', 'echoes input', { message: { type: 'string' } as never }, async (args) => {
      const msg = (args as Record<string, string>).message ?? '';
      return { content: [{ type: 'text', text: msg }] };
    });
    return server;
  }

  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          delete transports[sid];
        }
      };
      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'GET') {
      res.status(404).send('Not Found');
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    });
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        httpServer,
        close: () =>
          new Promise<void>((r) => {
            for (const t of Object.values(transports)) {
              t.close().catch(() => {});
            }
            httpServer.close(() => r());
          }),
      });
    });
  });
}

function createConnection(serverName: string, url: string, initTimeout = 5000): MCPConnection {
  return new MCPConnection({
    serverName,
    serverConfig: { url, type: 'streamable-http', initTimeout } as never,
  });
}

/**
 * Cleanly shut down an MCPConnection so no background handleReconnection
 * timers leak. Sets shouldStopReconnecting before disconnect so that
 * the transport close event doesn't trigger a reconnection loop.
 */
async function teardownConnection(conn: MCPConnection): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (conn as any).shouldStopReconnecting = true;
  conn.removeAllListeners();
  await conn.disconnect();
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MCPConnection as any).circuitBreakers.clear();
});

/* ------------------------------------------------------------------ */
/*  Fix #2 — Circuit breaker trips after rapid connect/disconnect      */
/*  cycles (5 cycles within 60s -> 30s cooldown)                       */
/* ------------------------------------------------------------------ */
describe('Fix #2: Circuit breaker stops rapid reconnect cycling', () => {
  it('blocks connection after 5 rapid cycles via static circuit breaker', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('cycling-server', srv.url);

    let completedCycles = 0;
    let breakerMessage = '';
    for (let cycle = 0; cycle < 10; cycle++) {
      try {
        await conn.connect();
        await teardownConnection(conn);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (conn as any).shouldStopReconnecting = false;
        completedCycles++;
      } catch (e) {
        breakerMessage = (e as Error).message;
        break;
      }
    }

    expect(breakerMessage).toContain('Circuit breaker is open');
    expect(completedCycles).toBeLessThanOrEqual(5);

    await srv.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #3 — SSE 400/405 with no session now short-circuits            */
/*  (returns early, no connectionChange 'error' emitted)               */
/* ------------------------------------------------------------------ */
describe('Fix #3: SSE 400/405 handled in same branch as 404', () => {
  it('400 with active session triggers reconnection (session lost)', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('sse-400', srv.url);
    await conn.connect();

    // Prevent background handleReconnection from spawning timers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conn as any).shouldStopReconnecting = true;

    const changes: string[] = [];
    conn.on('connectionChange', (s: string) => changes.push(s));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (conn as any).transport;
    transport.onerror({ message: 'Failed to open SSE stream', code: 400 });

    // With a session, 400 falls through to emit error (triggering reconnection).
    // Previously only 404 entered this code path; 400/405 were unhandled and
    // would also emit error but without the session-lost detection logic.
    expect(changes).toContain('error');

    await teardownConnection(conn);
    await srv.close();
  });

  it('405 with active session triggers reconnection (session lost)', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('sse-405', srv.url);
    await conn.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conn as any).shouldStopReconnecting = true;

    const changes: string[] = [];
    conn.on('connectionChange', (s: string) => changes.push(s));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (conn as any).transport;
    transport.onerror({ message: 'Method Not Allowed', code: 405 });

    expect(changes).toContain('error');

    await teardownConnection(conn);
    await srv.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #4 — Circuit breaker state persists in static Map across       */
/*  instance replacements                                              */
/* ------------------------------------------------------------------ */
describe('Fix #4: Circuit breaker state persists across instance replacement', () => {
  it('new MCPConnection for same serverName inherits breaker state from static Map', async () => {
    const srv = await startMCPServer();

    const conn1 = createConnection('replace', srv.url);
    await conn1.connect();
    await teardownConnection(conn1);

    // conn1's disconnect(false) inside connect() recorded a cycle in the static Map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cbAfterConn1 = (MCPConnection as any).circuitBreakers.get('replace');
    expect(cbAfterConn1).toBeDefined();
    const cyclesAfterConn1 = cbAfterConn1.cycleCount;
    expect(cyclesAfterConn1).toBeGreaterThan(0);

    // New instance for same server inherits the cycle count
    const conn2 = createConnection('replace', srv.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cbFromConn2 = (conn2 as any).getCircuitBreaker();
    expect(cbFromConn2.cycleCount).toBe(cyclesAfterConn1);

    await teardownConnection(conn2);
    await srv.close();
  });

  it('clearCooldown resets static state so explicit retry proceeds', () => {
    const conn = createConnection('replace', 'http://127.0.0.1:1/mcp');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (conn as any).getCircuitBreaker();
    cb.cooldownUntil = Date.now() + 999_999;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((conn as any).isCircuitOpen()).toBe(true);

    MCPConnection.clearCooldown('replace');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((conn as any).isCircuitOpen()).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #5 — Dead servers now trigger circuit breaker via              */
/*  recordFailedRound() in the catch path                              */
/* ------------------------------------------------------------------ */
describe('Fix #5: Dead server triggers circuit breaker', () => {
  it('3 failures trigger backoff, blocking subsequent attempts before they reach the SDK', async () => {
    const conn = createConnection('dead', 'http://127.0.0.1:1/mcp', 1000);
    const spy = jest.spyOn(conn.client, 'connect');

    const errors: string[] = [];
    for (let i = 0; i < 5; i++) {
      try {
        await conn.connect();
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    // First 3 reach client.connect and fail (recordFailedRound each time).
    // After 3rd failure backoff kicks in; attempts 4-5 are blocked at isCircuitOpen.
    expect(spy.mock.calls.length).toBe(3);
    expect(errors).toHaveLength(5);
    expect(errors.filter((m) => m.includes('Circuit breaker is open'))).toHaveLength(2);

    await conn.disconnect();
  });

  it('user B is immediately blocked when user A already tripped the breaker for the same server', async () => {
    const deadUrl = 'http://127.0.0.1:1/mcp';

    // User A connects 3 times and trips the breaker
    const userA = new MCPConnection({
      serverName: 'shared-dead',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-A',
    });

    for (let i = 0; i < 3; i++) {
      try {
        await userA.connect();
      } catch {
        // expected failures
      }
    }

    // User B's very first attempt is blocked — the breaker is per-server, not per-user.
    // This is intentional: when a server is down, it's down for everyone. Blocking
    // immediately prevents O(N×3) storms where each of N users independently discovers
    // the server is unreachable.
    const userB = new MCPConnection({
      serverName: 'shared-dead',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-B',
    });
    const spyB = jest.spyOn(userB.client, 'connect');

    let blockedMessage = '';
    try {
      await userB.connect();
    } catch (e) {
      blockedMessage = (e as Error).message;
    }

    expect(blockedMessage).toContain('Circuit breaker is open');
    // User B's client.connect was never called — blocked before reaching the SDK
    expect(spyB).toHaveBeenCalledTimes(0);

    await userA.disconnect();
    await userB.disconnect();
  });

  it('clearCooldown after user retry unblocks all users', async () => {
    const deadUrl = 'http://127.0.0.1:1/mcp';

    // Trip the breaker
    const userA = new MCPConnection({
      serverName: 'shared-dead-clear',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-A',
    });
    for (let i = 0; i < 3; i++) {
      try {
        await userA.connect();
      } catch {
        // expected
      }
    }

    // Breaker is open for everyone
    const userB = new MCPConnection({
      serverName: 'shared-dead-clear',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-B',
    });
    try {
      await userB.connect();
    } catch (e) {
      expect((e as Error).message).toContain('Circuit breaker is open');
    }

    // User A explicitly retries (forceNew) — clears the breaker for everyone
    MCPConnection.clearCooldown('shared-dead-clear');

    // User B can now attempt to connect again (will fail because server is
    // still dead, but the point is the breaker no longer blocks the attempt)
    const spyB = jest.spyOn(userB.client, 'connect');
    try {
      await userB.connect();
    } catch {
      // expected — server is still dead
    }

    // User B's attempt reached the SDK this time — not blocked by breaker
    expect(spyB).toHaveBeenCalledTimes(1);

    await userA.disconnect();
    await userB.disconnect();
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #5b — disconnect(false) preserves cycle tracking               */
/* ------------------------------------------------------------------ */
describe('Fix #5b: disconnect(false) preserves cycle tracking', () => {
  it('connect() passes false to disconnect, which calls recordCycle()', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('wipe', srv.url);
    const spy = jest.spyOn(conn, 'disconnect');

    await conn.connect();
    expect(spy).toHaveBeenCalledWith(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (MCPConnection as any).circuitBreakers.get('wipe');
    expect(cb).toBeDefined();
    expect(cb.cycleCount).toBeGreaterThan(0);

    await teardownConnection(conn);
    await srv.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #6 — OAuth failure uses cooldown-based retry                   */
/* ------------------------------------------------------------------ */
describe('Fix #6: OAuth failure uses cooldown-based retry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('isFailed expires after first cooldown of 5 min', () => {
    jest.setSystemTime(Date.now());
    const tracker = new OAuthReconnectionTracker();
    tracker.setFailed('u1', 'srv');

    expect(tracker.isFailed('u1', 'srv')).toBe(true);
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);
  });

  it('progressive cooldown: 5m, 10m, 20m, 30m (capped)', () => {
    jest.setSystemTime(Date.now());
    const tracker = new OAuthReconnectionTracker();

    tracker.setFailed('u1', 'srv');
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);

    tracker.setFailed('u1', 'srv');
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);

    tracker.setFailed('u1', 'srv');
    jest.advanceTimersByTime(20 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);

    // 4th failure: 30 min cap — still blocked at 29m, clear at 30m
    tracker.setFailed('u1', 'srv');
    jest.advanceTimersByTime(29 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(true);
    jest.advanceTimersByTime(1 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);
  });

  it('removeFailed resets attempt count so next failure starts at 5m', () => {
    jest.setSystemTime(Date.now());
    const tracker = new OAuthReconnectionTracker();

    tracker.setFailed('u1', 'srv');
    tracker.setFailed('u1', 'srv');
    tracker.setFailed('u1', 'srv');
    tracker.removeFailed('u1', 'srv');

    tracker.setFailed('u1', 'srv');
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(tracker.isFailed('u1', 'srv')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #8 — Default initTimeout reduced from 120s to 30s              */
/* ------------------------------------------------------------------ */
describe('Fix #8: Default initTimeout is 30s', () => {
  it('options.initTimeout is undefined, code falls back to DEFAULT_INIT_TIMEOUT (30s)', () => {
    const conn = new MCPConnection({
      serverName: 'prod',
      serverConfig: { url: 'http://127.0.0.1:1/mcp', type: 'streamable-http' } as never,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((conn as any).options.initTimeout).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: Circuit breaker caps rapid cycling with real transport */
/* ------------------------------------------------------------------ */
describe('Cascade: Circuit breaker caps rapid cycling', () => {
  it('breaker trips before 10 cycles complete against a live server', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('cascade', srv.url);
    const spy = jest.spyOn(conn.client, 'connect');

    let completedCycles = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await conn.connect();
        await teardownConnection(conn);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (conn as any).shouldStopReconnecting = false;
        completedCycles++;
      } catch (e) {
        if ((e as Error).message.includes('Circuit breaker is open')) {
          break;
        }
        throw e;
      }
    }

    expect(completedCycles).toBeLessThanOrEqual(5);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);

    await srv.close();
  });

  it('breaker bounds failures against a killed server', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('cascade-die', srv.url, 2000);

    await conn.connect();
    await teardownConnection(conn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conn as any).shouldStopReconnecting = false;
    await srv.close();

    let breakerTripped = false;
    for (let i = 0; i < 10; i++) {
      try {
        await conn.connect();
      } catch (e) {
        if ((e as Error).message.includes('Circuit breaker is open')) {
          breakerTripped = true;
          break;
        }
      }
    }

    expect(breakerTripped).toBe(true);
  }, 30_000);
});

/* ------------------------------------------------------------------ */
/*  Sanity: Real transport works end-to-end                            */
/* ------------------------------------------------------------------ */
describe('Sanity: Real MCP SDK transport works correctly', () => {
  it('connects, lists tools, and disconnects cleanly', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('sanity', srv.url);

    await conn.connect();
    expect(await conn.isConnected()).toBe(true);

    const tools = await conn.fetchTools();
    expect(tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'echo' })]));

    await teardownConnection(conn);
    await srv.close();
  });
});
