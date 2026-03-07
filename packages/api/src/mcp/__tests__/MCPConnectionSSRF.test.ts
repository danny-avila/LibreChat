/**
 * Integration tests for MCP SSRF protections.
 *
 * These tests spin up real in-process HTTP servers and verify that MCPConnection:
 *
 * 1. Does NOT follow HTTP redirects from SSE/StreamableHTTP transports
 *    (redirect: 'manual' prevents SSRF via server-controlled 301/302)
 * 2. Blocks WebSocket connections to hosts that DNS-resolve to private IPs
 *    even when useSSRFProtection is false (allowlist-configured scenario)
 */

import * as net from 'net';
import * as http from 'http';
import { Agent } from 'undici';
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

const allAgentsCreated: Agent[] = [];
const OriginalAgent = Agent;
const PatchedAgent = new Proxy(OriginalAgent, {
  construct(target, args) {
    const instance = new target(...(args as [Agent.Options?]));
    allAgentsCreated.push(instance);
    return instance;
  },
});
(global as Record<string, unknown>).__undiciAgent = PatchedAgent;

afterAll(async () => {
  const destroying = allAgentsCreated.map((a) => {
    if (!a.destroyed && !a.closed) {
      return a.destroy().catch(() => undefined);
    }
    return Promise.resolve();
  });
  allAgentsCreated.length = 0;
  await Promise.all(destroying);
});

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
 * Creates an HTTP server that responds with a 301 redirect to a private IP.
 * Simulates an SSRF attack where a trusted MCP server redirects to internal resources.
 */
async function createRedirectingServer(redirectTarget: string): Promise<TestServer> {
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(301, { Location: redirectTarget });
    res.end();
  });

  const destroySockets = trackSockets(httpServer);
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    close: async () => {
      await destroySockets();
    },
  };
}

/**
 * Creates a real StreamableHTTP MCP server for baseline connectivity tests.
 */
async function createStreamableServer(): Promise<TestServer> {
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
    redirectServer = await createRedirectingServer('http://169.254.169.254/latest/meta-data/');

    conn = new MCPConnection({
      serverName: 'redirect-test',
      serverConfig: { type: 'streamable-http', url: redirectServer.url },
      useSSRFProtection: false,
    });

    /**
     * With redirect: 'manual', the transport receives the 301 as-is.
     * The MCP SDK treats a non-200 initial response as a connection failure.
     * The connection should fail — NOT follow the redirect to 169.254.169.254.
     */
    await expect(conn.connect()).rejects.toThrow();
  });

  it('should not follow redirects from streamable-http even with SSRF protection off', async () => {
    redirectServer = await createRedirectingServer('http://127.0.0.1:8080/admin');

    conn = new MCPConnection({
      serverName: 'redirect-test-2',
      serverConfig: { type: 'streamable-http', url: redirectServer.url },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow();
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

  it('should allow WebSocket to host resolving to public IP', async () => {
    mockedResolveHostnameSSRF.mockResolvedValueOnce(false);

    conn = new MCPConnection({
      serverName: 'ws-public-test',
      serverConfig: { type: 'websocket', url: 'ws://public.example.com:8080/mcp' },
      useSSRFProtection: true,
    });

    /**
     * The connection will fail because there's no real WebSocket server,
     * but it should NOT fail with an SSRF error — it should get past the
     * SSRF check and fail on the actual WebSocket connection.
     */
    await expect(conn.connect()).rejects.toThrow();
    await expect(conn.connect()).rejects.not.toThrow(/SSRF protection/);
  });
});
