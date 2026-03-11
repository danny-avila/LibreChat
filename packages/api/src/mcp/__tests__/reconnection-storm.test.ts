/**
 * Reconnection storm regression tests for PR #12162.
 *
 * Validates circuit breaker, throttling, cooldown, and timeout fixes using real
 * MCP SDK transports (no mocked stubs). A real StreamableHTTP server is spun up
 * per test suite and MCPConnection talks to it through a genuine HTTP stack.
 */
import http from 'http';
import { randomUUID } from 'crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Socket } from 'net';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import { OAuthReconnectionTracker } from '~/mcp/oauth/OAuthReconnectionTracker';
import { createOAuthMCPServer } from './helpers/oauthTestServer';
import { MCPConnection } from '~/mcp/connection';
import { mcpConfig } from '~/mcp/mcpConfig';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface TestServer {
  url: string;
  httpServer: http.Server;
  close: () => Promise<void>;
}

function trackSockets(httpServer: http.Server): () => Promise<void> {
  const sockets = new Set<Socket>();
  httpServer.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return () =>
    new Promise<void>((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      httpServer.close(() => resolve());
    });
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
      const destroySockets = trackSockets(httpServer);
      const addr = httpServer.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        httpServer,
        close: async () => {
          for (const t of Object.values(transports)) {
            t.close().catch(() => {});
          }
          await destroySockets();
        },
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
/*  cycles (CB_MAX_CYCLES within window -> cooldown)                    */
/* ------------------------------------------------------------------ */
describe('Fix #2: Circuit breaker stops rapid reconnect cycling', () => {
  it('blocks connection after CB_MAX_CYCLES rapid cycles via static circuit breaker', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('cycling-server', srv.url);

    let completedCycles = 0;
    let breakerMessage = '';
    const maxAttempts = mcpConfig.CB_MAX_CYCLES * 2;
    for (let cycle = 0; cycle < maxAttempts; cycle++) {
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
    expect(completedCycles).toBeLessThanOrEqual(mcpConfig.CB_MAX_CYCLES);

    await srv.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #3 — SSE 400/405 handled in same branch as 404                */
/* ------------------------------------------------------------------ */
describe('Fix #3: SSE 400/405 handled in same branch as 404', () => {
  it('400 with active session triggers reconnection (session lost)', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('sse-400', srv.url);
    await conn.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conn as any).shouldStopReconnecting = true;

    const changes: string[] = [];
    conn.on('connectionChange', (s: string) => changes.push(s));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (conn as any).transport;
    transport.onerror({ message: 'Failed to open SSE stream', code: 400 });

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cbAfterConn1 = (MCPConnection as any).circuitBreakers.get('replace');
    expect(cbAfterConn1).toBeDefined();
    const cyclesAfterConn1 = cbAfterConn1.cycleCount;
    expect(cyclesAfterConn1).toBeGreaterThan(0);

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
  it('failures trigger backoff, blocking subsequent attempts before they reach the SDK', async () => {
    const conn = createConnection('dead', 'http://127.0.0.1:1/mcp', 1000);
    const spy = jest.spyOn(conn.client, 'connect');

    const totalAttempts = mcpConfig.CB_MAX_FAILED_ROUNDS + 2;
    const errors: string[] = [];
    for (let i = 0; i < totalAttempts; i++) {
      try {
        await conn.connect();
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    expect(spy.mock.calls.length).toBe(mcpConfig.CB_MAX_FAILED_ROUNDS);
    expect(errors).toHaveLength(totalAttempts);
    expect(errors.filter((m) => m.includes('Circuit breaker is open'))).toHaveLength(2);

    await conn.disconnect();
  });

  it('user B is immediately blocked when user A already tripped the breaker for the same server', async () => {
    const deadUrl = 'http://127.0.0.1:1/mcp';

    const userA = new MCPConnection({
      serverName: 'shared-dead',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-A',
    });

    for (let i = 0; i < mcpConfig.CB_MAX_FAILED_ROUNDS; i++) {
      try {
        await userA.connect();
      } catch {
        // expected
      }
    }

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
    expect(spyB).toHaveBeenCalledTimes(0);

    await userA.disconnect();
    await userB.disconnect();
  });

  it('clearCooldown after user retry unblocks all users', async () => {
    const deadUrl = 'http://127.0.0.1:1/mcp';

    const userA = new MCPConnection({
      serverName: 'shared-dead-clear',
      serverConfig: { url: deadUrl, type: 'streamable-http', initTimeout: 1000 } as never,
      userId: 'user-A',
    });
    for (let i = 0; i < mcpConfig.CB_MAX_FAILED_ROUNDS; i++) {
      try {
        await userA.connect();
      } catch {
        // expected
      }
    }

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

    MCPConnection.clearCooldown('shared-dead-clear');

    const spyB = jest.spyOn(userB.client, 'connect');
    try {
      await userB.connect();
    } catch {
      // expected — server is still dead
    }

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
/*  Integration: Circuit breaker caps rapid cycling with real transport */
/* ------------------------------------------------------------------ */
describe('Cascade: Circuit breaker caps rapid cycling', () => {
  it('breaker trips before double CB_MAX_CYCLES complete against a live server', async () => {
    const srv = await startMCPServer();
    const conn = createConnection('cascade', srv.url);
    const spy = jest.spyOn(conn.client, 'connect');

    let completedCycles = 0;
    const maxAttempts = mcpConfig.CB_MAX_CYCLES * 2;
    for (let i = 0; i < maxAttempts; i++) {
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

    expect(completedCycles).toBeLessThanOrEqual(mcpConfig.CB_MAX_CYCLES);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(mcpConfig.CB_MAX_CYCLES);

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
/*  OAuth: cycle recovery after successful OAuth reconnect             */
/* ------------------------------------------------------------------ */
describe('OAuth: cycle budget recovery after successful OAuth', () => {
  let oauthServer: OAuthTestServer;

  beforeEach(async () => {
    oauthServer = await createOAuthMCPServer({ tokenTTLMs: 60000 });
  });

  afterEach(async () => {
    await oauthServer.close();
  });

  async function exchangeCodeForToken(serverUrl: string): Promise<string> {
    const authRes = await fetch(`${serverUrl}authorize?redirect_uri=http://localhost&state=test`, {
      redirect: 'manual',
    });
    const location = authRes.headers.get('location') ?? '';
    const code = new URL(location).searchParams.get('code') ?? '';
    const tokenRes = await fetch(`${serverUrl}token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&code=${code}`,
    });
    const data = (await tokenRes.json()) as { access_token: string };
    return data.access_token;
  }

  it('should decrement cycle count after successful OAuth recovery', async () => {
    const serverName = 'oauth-cycle-test';
    MCPConnection.clearCooldown(serverName);

    const conn = new MCPConnection({
      serverName,
      serverConfig: { type: 'streamable-http', url: oauthServer.url, initTimeout: 10000 },
      userId: 'user-1',
    });

    // When oauthRequired fires, get a token and emit oauthHandled
    // This triggers the oauthRecovery path inside connectClient
    conn.on('oauthRequired', async () => {
      const accessToken = await exchangeCodeForToken(oauthServer.url);
      conn.setOAuthTokens({
        access_token: accessToken,
        token_type: 'Bearer',
      } as MCPOAuthTokens);
      conn.emit('oauthHandled');
    });

    // connect() → 401 → oauthRequired → oauthHandled → connectClient returns
    // connect() sees not connected → throws "Connection not established"
    await expect(conn.connect()).rejects.toThrow('Connection not established');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (MCPConnection as any).circuitBreakers.get(serverName);
    const cyclesBeforeRetry = cb.cycleCount;

    // Retry — should succeed and decrement cycle count via oauthRecovery
    await conn.connect();
    expect(await conn.isConnected()).toBe(true);

    const cyclesAfterSuccess = cb.cycleCount;
    // The retry adds +1 cycle (disconnect(false)) then -1 (oauthRecovery decrement)
    // So cyclesAfterSuccess should equal cyclesBeforeRetry, not cyclesBeforeRetry + 1
    expect(cyclesAfterSuccess).toBe(cyclesBeforeRetry);

    await teardownConnection(conn);
  });

  it('should allow more OAuth reconnects than non-OAuth before breaker trips', async () => {
    const serverName = 'oauth-budget';
    MCPConnection.clearCooldown(serverName);

    // Each OAuth flow: connect (+1) → 401 → oauthHandled → retry connect (+1) → success (-1) = net 1
    // Without the decrement it would be net 2 per flow, tripping the breaker after ~2 users
    let successfulFlows = 0;
    for (let i = 0; i < 10; i++) {
      const conn = new MCPConnection({
        serverName,
        serverConfig: { type: 'streamable-http', url: oauthServer.url, initTimeout: 10000 },
        userId: `user-${i}`,
      });

      conn.on('oauthRequired', async () => {
        const accessToken = await exchangeCodeForToken(oauthServer.url);
        conn.setOAuthTokens({
          access_token: accessToken,
          token_type: 'Bearer',
        } as MCPOAuthTokens);
        conn.emit('oauthHandled');
      });

      try {
        // First connect: 401 → oauthHandled → returns without connection
        await conn.connect().catch(() => {});
        // Retry: succeeds with token, decrements cycle
        await conn.connect();
        successfulFlows++;
        await teardownConnection(conn);
      } catch (e) {
        conn.removeAllListeners();
        if ((e as Error).message.includes('Circuit breaker is open')) {
          break;
        }
      }
    }

    // With the oauthRecovery decrement, each flow is net ~1 cycle instead of ~2,
    // so we should get more successful flows before the breaker trips
    expect(successfulFlows).toBeGreaterThanOrEqual(3);
  });

  it('should not decrement cycle count when OAuth fails', async () => {
    const serverName = 'oauth-failed-no-decrement';
    MCPConnection.clearCooldown(serverName);

    const conn = new MCPConnection({
      serverName,
      serverConfig: { type: 'streamable-http', url: oauthServer.url, initTimeout: 10000 },
      userId: 'user-1',
    });

    conn.on('oauthRequired', () => {
      conn.emit('oauthFailed', new Error('user denied'));
    });

    await expect(conn.connect()).rejects.toThrow();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (MCPConnection as any).circuitBreakers.get(serverName);
    const cyclesAfterFailure = cb.cycleCount;

    // connect() recorded +1 cycle, oauthFailed should NOT decrement
    expect(cyclesAfterFailure).toBeGreaterThanOrEqual(1);

    conn.removeAllListeners();
  });
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
