/**
 * Integration tests for MCP SSRF protections.
 *
 * These tests spin up real in-process HTTP servers and verify that MCPConnection:
 *
 * 1. Does NOT follow 301/302 redirects from SSE/StreamableHTTP transports
 *    (redirect: 'manual' prevents SSRF via server-controlled 301/302)
 * 2. DOES follow 307/308 redirects (method-preserving) with a depth limit of 5,
 *    as required by servers like Coda that route doc-scoped tool calls via 308
 * 3. Blocks WebSocket connections to hosts that DNS-resolve to private IPs,
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
 * Builds an HTTP request handler that routes incoming requests to (per-session)
 * `StreamableHTTPServerTransport` instances backed by an `McpServer`. Sessions
 * are stored in the caller-provided `sessions` Map so the caller can drain them
 * during teardown.
 */
function createMCPRequestHandler(
  sessions: Map<string, StreamableHTTPServerTransport>,
  serverName: string,
): http.RequestListener {
  return async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: serverName, version: '0.0.1' });
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);

    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport!.sessionId!);
    }
  };
}

async function closeMCPSessions(
  sessions: Map<string, StreamableHTTPServerTransport>,
): Promise<void> {
  const closing = [...sessions.values()].map((t) => t.close().catch(() => undefined));
  sessions.clear();
  await Promise.all(closing);
}

/**
 * Creates a real StreamableHTTP MCP server for baseline connectivity tests.
 */
async function createStreamableServer(): Promise<Omit<TestServer, 'redirectHit'>> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const httpServer = http.createServer(createMCPRequestHandler(sessions, 'test-ssrf'));

  const destroySockets = trackSockets(httpServer);
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    close: async () => {
      await closeMCPSessions(sessions);
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

/**
 * Creates a single HTTP server that 307/308-redirects from the root path to
 * `/mcp`, where a real MCP server is mounted. The redirect stays on the same
 * origin (Coda-style doc-scoped routing), so credential-bearing headers like
 * `mcp-session-id` survive the cross-path hop and the MCP session keeps state.
 */
async function createRedirectingMCPServer(
  statusCode: 307 | 308,
): Promise<TestServer & { close: () => Promise<void> }> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const state = { redirectHit: false };
  const mcpPath = '/mcp';
  const port = await getFreePort();
  const mcpHandler = createMCPRequestHandler(sessions, 'redirect-target');

  const server = http.createServer(async (req, res) => {
    if ((req.url ?? '').startsWith(mcpPath)) {
      state.redirectHit = true;
      await mcpHandler(req, res);
      return;
    }

    res.writeHead(statusCode, { Location: `http://127.0.0.1:${port}${mcpPath}` });
    res.end();
  });

  const destroySockets = trackSockets(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    get redirectHit() {
      return state.redirectHit;
    },
    close: async () => {
      await closeMCPSessions(sessions);
      await destroySockets();
    },
  };
}

/**
 * Creates a single HTTP server with `depth` chained 307/308 redirects on
 * `/hop/N → /hop/N-1 → … → /hop/0`, where `/hop/0` returns a plain 200.
 * Same-origin throughout, so the chain exercises only redirect-depth limits
 * (not cross-origin header behavior).
 */
async function createRedirectChain(depth: number, statusCode: 307 | 308): Promise<TestServer> {
  const state = { redirectHit: false };
  const port = await getFreePort();

  const server = http.createServer((req, res) => {
    const match = (req.url ?? '/').match(/^\/hop\/(\d+)/);
    const n = match ? parseInt(match[1], 10) : -1;
    if (n > 0) {
      res.writeHead(statusCode, {
        Location: `http://127.0.0.1:${port}/hop/${n - 1}`,
      });
      res.end();
      return;
    }
    state.redirectHit = true;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('final');
  });

  const destroySockets = trackSockets(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/hop/${depth}`,
    get redirectHit() {
      return state.redirectHit;
    },
    close: destroySockets,
  };
}

/**
 * Same-origin redirect chain ending at a real MCP server at `/mcp`. URL
 * `/hop/N-1` redirects through N hops total, with the final hop landing on
 * `/mcp`. Used to verify MCP traffic survives the maximum allowed redirect
 * depth.
 */
async function createRedirectChainToMCP(depth: number, statusCode: 307 | 308): Promise<TestServer> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const state = { redirectHit: false };
  const mcpPath = '/mcp';
  const port = await getFreePort();
  const mcpHandler = createMCPRequestHandler(sessions, 'mcp-via-chain');

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    if (url.startsWith(mcpPath)) {
      state.redirectHit = true;
      await mcpHandler(req, res);
      return;
    }

    const match = url.match(/^\/hop\/(\d+)/);
    const n = match ? parseInt(match[1], 10) : 0;
    const nextLocation =
      n > 0 ? `http://127.0.0.1:${port}/hop/${n - 1}` : `http://127.0.0.1:${port}${mcpPath}`;
    res.writeHead(statusCode, { Location: nextLocation });
    res.end();
  });

  const destroySockets = trackSockets(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/hop/${depth - 1}`,
    get redirectHit() {
      return state.redirectHit;
    },
    close: async () => {
      await closeMCPSessions(sessions);
      await destroySockets();
    },
  };
}

interface HeaderCaptureServer {
  url: string;
  receivedHeaders: http.IncomingHttpHeaders[];
  close: () => Promise<void>;
}

/**
 * Captures every incoming request's headers and replies with a benign 200,
 * so tests can assert which headers actually crossed a redirect boundary.
 */
async function createHeaderCaptureServer(): Promise<HeaderCaptureServer> {
  const captured: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((req, res) => {
    captured.push({ ...req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  const destroySockets = trackSockets(server);
  const port = await getFreePort();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}/`,
    receivedHeaders: captured,
    close: destroySockets,
  };
}

/**
 * Issues a single 307/308 redirect to `redirectTarget` (which lives on a
 * different port and is therefore a different origin). Used to verify
 * cross-origin credential-stripping behavior.
 */
async function createCrossOriginRedirectingServer(
  redirectTarget: string,
  statusCode: 307 | 308,
): Promise<TestServer> {
  const state = { redirectHit: false };
  const server = http.createServer((_req, res) => {
    state.redirectHit = true;
    res.writeHead(statusCode, { Location: redirectTarget });
    res.end();
  });
  const destroySockets = trackSockets(server);
  const port = await getFreePort();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}/`,
    get redirectHit() {
      return state.redirectHit;
    },
    close: destroySockets,
  };
}

describe('MCP SSRF protection – 307/308 redirect following', () => {
  let server: TestServer | undefined;
  let conn: MCPConnection | null;

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    if (server) {
      await server.close();
      server = undefined;
    }
    jest.restoreAllMocks();
  });

  it('should follow a 308 redirect and connect to the target MCP server', async () => {
    server = await createRedirectingMCPServer(308);

    conn = new MCPConnection({
      serverName: 'redirect-308',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await conn.connect();
    const tools = await conn.fetchTools();
    expect(tools).toBeDefined();
    expect(server.redirectHit).toBe(true);
  });

  it('should follow a 307 redirect and connect to the target MCP server', async () => {
    server = await createRedirectingMCPServer(307);

    conn = new MCPConnection({
      serverName: 'redirect-307',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await conn.connect();
    const tools = await conn.fetchTools();
    expect(tools).toBeDefined();
    expect(server.redirectHit).toBe(true);
  });

  it('should stop following redirects after 5 hops', async () => {
    server = await createRedirectChain(6, 308);

    conn = new MCPConnection({
      serverName: 'redirect-too-deep',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow();
    expect(server.redirectHit).toBe(false);
  });

  it('should reach the target after exactly 5 redirect hops (at the limit)', async () => {
    server = await createRedirectChain(5, 308);

    conn = new MCPConnection({
      serverName: 'redirect-at-limit',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await expect(conn.connect()).rejects.toThrow();
    expect(server.redirectHit).toBe(true);
  });

  it('should complete an MCP request through 5 same-origin redirect hops', async () => {
    server = await createRedirectChainToMCP(5, 308);

    conn = new MCPConnection({
      serverName: 'redirect-chain-mcp',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await conn.connect();
    const tools = await conn.fetchTools();
    expect(tools).toBeDefined();
    expect(server.redirectHit).toBe(true);
  });
});

describe('MCP SSRF protection – 307/308 redirect to private IP', () => {
  let server: TestServer | undefined;
  let conn: MCPConnection | null;

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    if (server) {
      await server.close();
      server = undefined;
    }
    jest.restoreAllMocks();
  });

  it('should block a 308 redirect whose target resolves to a private IP (allowlist scenario)', async () => {
    const capture = await createHeaderCaptureServer();
    try {
      server = await createCrossOriginRedirectingServer(capture.url, 308);
      mockedResolveHostnameSSRF.mockResolvedValueOnce(true);

      conn = new MCPConnection({
        serverName: 'redirect-ssrf-block',
        serverConfig: { type: 'streamable-http', url: server.url },
        useSSRFProtection: false,
      });

      await expect(conn.connect()).rejects.toThrow();
      expect(server.redirectHit).toBe(true);
      expect(capture.receivedHeaders).toHaveLength(0);
    } finally {
      await capture.close();
    }
  });

  it('should block a 307 redirect whose target resolves to a private IP (SSRF protection on)', async () => {
    const capture = await createHeaderCaptureServer();
    try {
      server = await createCrossOriginRedirectingServer(capture.url, 307);
      mockedResolveHostnameSSRF.mockResolvedValueOnce(true);

      conn = new MCPConnection({
        serverName: 'redirect-ssrf-block-on',
        serverConfig: { type: 'streamable-http', url: server.url },
        useSSRFProtection: true,
      });

      await expect(conn.connect()).rejects.toThrow();
      expect(server.redirectHit).toBe(true);
      expect(capture.receivedHeaders).toHaveLength(0);
    } finally {
      await capture.close();
    }
  });
});

describe('MCP SSRF protection – cross-origin credential stripping on redirect', () => {
  let server: TestServer | undefined;
  let conn: MCPConnection | null;

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    if (server) {
      await server.close();
      server = undefined;
    }
    jest.restoreAllMocks();
  });

  it('should strip Authorization, runtime headers, and config headers when 308-redirecting cross-origin', async () => {
    const capture = await createHeaderCaptureServer();
    try {
      server = await createCrossOriginRedirectingServer(capture.url, 308);

      conn = new MCPConnection({
        serverName: 'cross-origin-strip',
        serverConfig: {
          type: 'streamable-http',
          url: server.url,
          headers: {
            'X-Config-Api-Key': 'config-level-secret',
            'X-Internal-Token': 'config-internal-token',
          },
        },
        oauthTokens: {
          access_token: 'super-secret-bearer-token',
          token_type: 'Bearer',
          obtained_at: Date.now(),
        },
        useSSRFProtection: false,
      });
      conn.setRequestHeaders({ 'X-Runtime-Api-Key': 'runtime-private-api-key' });

      await expect(conn.connect()).rejects.toThrow();
      expect(server.redirectHit).toBe(true);
      expect(capture.receivedHeaders.length).toBeGreaterThan(0);

      for (const headers of capture.receivedHeaders) {
        expect(headers['authorization']).toBeUndefined();
        expect(headers['x-runtime-api-key']).toBeUndefined();
        expect(headers['x-config-api-key']).toBeUndefined();
        expect(headers['x-internal-token']).toBeUndefined();
        expect(headers['mcp-session-id']).toBeUndefined();
        expect(headers['cookie']).toBeUndefined();
        /** Non-credential protocol headers must survive — guards against a
         * regression that strips everything indiscriminately. */
        expect(headers['accept']).toBeDefined();
        expect(headers['content-type']).toBeDefined();
      }
    } finally {
      await capture.close();
    }
  });

  it('should preserve credential headers on same-origin 308 redirects (Coda-style flow)', async () => {
    server = await createRedirectingMCPServer(308);

    conn = new MCPConnection({
      serverName: 'same-origin-preserve',
      serverConfig: { type: 'streamable-http', url: server.url },
      oauthTokens: {
        access_token: 'preserved-bearer',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      },
      useSSRFProtection: false,
    });

    /** Same-origin redirect → MCP session continuity must hold across hops. */
    await conn.connect();
    const tools = await conn.fetchTools();
    expect(tools).toBeDefined();
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
