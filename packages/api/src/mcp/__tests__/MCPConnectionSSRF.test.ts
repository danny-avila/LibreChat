/**
 * Integration tests for MCP SSRF protections.
 *
 * These tests spin up real in-process HTTP servers and verify that MCPConnection:
 *
 * 1. Does NOT follow HTTP redirects from SSE/StreamableHTTP transports
 *    (redirect: 'manual' prevents SSRF via server-controlled 301/302)
 * 2. Blocks WebSocket connections to hosts that DNS-resolve to private IPs,
 *    regardless of whether useSSRFProtection is enabled (allowlist scenario)
 */

import * as net from 'net';
import * as http from 'http';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Socket } from 'net';
import { MCPConnection } from '~/mcp/connection';
import { resolveHostnameSSRF } from '~/auth';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { CONNECTION_CHECK_TTL: 0 },
}));

const mockedResolveHostnameSSRF = resolveHostnameSSRF as jest.MockedFunction<
  typeof resolveHostnameSSRF
>;

async function safeDisconnect(conn: MCPConnection | null): Promise<void> {
  if (!conn) {
    return;
  }
  (conn as unknown as { shouldStopReconnecting: boolean }).shouldStopReconnecting = true;
  conn.removeAllListeners();
  await conn.disconnect();
}

interface TestServer {
  url: string;
  redirectHit: boolean;
  close: () => Promise<void>;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => (err ? reject(err) : resolve(addr.port)));
    });
  });
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

/**
 * Creates an HTTP server that responds with a 301 redirect to a target URL.
 * A second server is spun up at the redirect target to detect whether the
 * redirect was actually followed.
 */
async function createRedirectingServer(redirectTarget: string): Promise<TestServer> {
  const state = { redirectHit: false };

  const targetPort = new URL(redirectTarget).port || '80';
  const targetServer = http.createServer((_req, res) => {
    state.redirectHit = true;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('You should not be here');
  });
  const destroyTargetSockets = trackSockets(targetServer);
  await new Promise<void>((resolve) =>
    targetServer.listen(parseInt(targetPort), '127.0.0.1', resolve),
  );

  const httpServer = http.createServer((_req, res) => {
    res.writeHead(301, { Location: redirectTarget });
    res.end();
  });

  const destroySockets = trackSockets(httpServer);
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    get redirectHit() {
      return state.redirectHit;
    },
    close: async () => {
      await destroySockets();
      await destroyTargetSockets();
    },
  };
}

/**
 * Creates a real StreamableHTTP MCP server for baseline connectivity tests.
 */
async function createStreamableServer(): Promise<Omit<TestServer, 'redirectHit'>> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: 'test-ssrf', version: '0.0.1' });
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);

    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport!.sessionId!);
    }
  });

  const destroySockets = trackSockets(httpServer);
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    close: async () => {
      const closing = [...sessions.values()].map((t) => t.close().catch(() => undefined));
      sessions.clear();
      await Promise.all(closing);
      await destroySockets();
    },
  };
}

describe('MCP SSRF protection – redirect blocking', () => {
  let redirectServer: TestServer;
  let conn: MCPConnection | null;

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    if (redirectServer) {
      await redirectServer.close();
    }
    jest.restoreAllMocks();
  });

  it('should not follow redirects from streamable-http to a private IP', async () => {
    const targetPort = await getFreePort();
    redirectServer = await createRedirectingServer(
      `http://127.0.0.1:${targetPort}/latest/meta-data/`,
    );

    conn = new MCPConnection({
      serverName: 'redirect-test',
      serverConfig: { type: 'streamable-http', url: redirectServer.url },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow();
    expect(redirectServer.redirectHit).toBe(false);
  });

  it('should not follow redirects even with SSRF protection off (allowlist scenario)', async () => {
    const targetPort = await getFreePort();
    redirectServer = await createRedirectingServer(`http://127.0.0.1:${targetPort}/admin`);

    conn = new MCPConnection({
      serverName: 'redirect-test-2',
      serverConfig: { type: 'streamable-http', url: redirectServer.url },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow();
    expect(redirectServer.redirectHit).toBe(false);
  });

  it('should connect normally to a non-redirecting streamable-http server', async () => {
    const realServer = await createStreamableServer();
    try {
      conn = new MCPConnection({
        serverName: 'legit-server',
        serverConfig: { type: 'streamable-http', url: realServer.url },
        useSSRFProtection: false,
      });

      await conn.connect();
      const tools = await conn.fetchTools();
      expect(tools).toBeDefined();
    } finally {
      await safeDisconnect(conn);
      conn = null;
      await realServer.close();
    }
  });
});

describe('MCP SSRF protection – WebSocket DNS resolution', () => {
  let conn: MCPConnection | null;

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    jest.restoreAllMocks();
  });

  it('should block WebSocket to host resolving to private IP when SSRF protection is on', async () => {
    mockedResolveHostnameSSRF.mockResolvedValueOnce(true);

    conn = new MCPConnection({
      serverName: 'ws-ssrf-test',
      serverConfig: { type: 'websocket', url: 'ws://evil.example.com:8080/mcp' },
      useSSRFProtection: true,
    });

    await expect(conn.connect()).rejects.toThrow(/SSRF protection/);
    expect(mockedResolveHostnameSSRF).toHaveBeenCalledWith(
      expect.stringContaining('evil.example.com'),
    );
  });

  it('should block WebSocket to host resolving to private IP even with SSRF protection off', async () => {
    mockedResolveHostnameSSRF.mockResolvedValueOnce(true);

    conn = new MCPConnection({
      serverName: 'ws-ssrf-allowlist',
      serverConfig: { type: 'websocket', url: 'ws://allowlisted.example.com:8080/mcp' },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow(/SSRF protection/);
    expect(mockedResolveHostnameSSRF).toHaveBeenCalledWith(
      expect.stringContaining('allowlisted.example.com'),
    );
  });

  it('should allow WebSocket to host resolving to public IP', async () => {
    mockedResolveHostnameSSRF.mockResolvedValueOnce(false);

    conn = new MCPConnection({
      serverName: 'ws-public-test',
      serverConfig: { type: 'websocket', url: 'ws://public.example.com:8080/mcp' },
      useSSRFProtection: true,
    });

    /** Fails on connect (no real server), but the error must not be an SSRF rejection. */
    await expect(conn.connect()).rejects.not.toThrow(/SSRF protection/);
  });
});
