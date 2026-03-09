/**
 * Integration tests for MCP server reinitialize recovery (issue #12143).
 *
 * Reproduces the bug: when an MCP server is unreachable at startup,
 * inspection fails and the server config is never stored — making the
 * reinitialize button return 404 and blocking all recovery.
 *
 * These tests spin up a real in-process MCP server using the SDK's
 * StreamableHTTPServerTransport and exercise the full
 * MCPServersInitializer → MCPServersRegistry → MCPServerInspector pipeline
 * with real connections — no mocked transports, no mocked inspections.
 *
 * Minimal mocks: only logger, auth/SSRF, cluster, mcpConfig, and DB repo
 * (to avoid MongoDB). Everything else — the inspector, registry, cache,
 * initializer, and MCP connection — runs for real.
 */

import * as net from 'net';
import * as http from 'http';
import { Agent } from 'undici';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Socket } from 'net';
import type * as t from '~/mcp/types';
import { registryStatusCache } from '~/mcp/registry/cache/RegistryStatusCache';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { MCPConnection } from '~/mcp/connection';

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

jest.mock('~/cluster', () => ({
  isLeader: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { CONNECTION_CHECK_TTL: 0 },
}));

jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockMongoose = {} as typeof import('mongoose');

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
  if (!conn) return;
  (conn as unknown as { shouldStopReconnecting: boolean }).shouldStopReconnecting = true;
  conn.removeAllListeners();
  await conn.disconnect();
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
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      httpServer.close(() => resolve());
    });
}

interface TestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

async function createMCPServer(): Promise<TestServer> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: 'recovery-test-server', version: '0.0.1' });
      mcp.tool('echo', 'Echo tool for testing', {}, async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }));
      mcp.tool('greet', 'Greeting tool', {}, async () => ({
        content: [{ type: 'text', text: 'hello' }],
      }));
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
    port,
    close: async () => {
      const closing = [...sessions.values()].map((t) => t.close().catch(() => undefined));
      sessions.clear();
      await Promise.all(closing);
      await destroySockets();
    },
  };
}

describe('MCP reinitialize recovery – integration (issue #12143)', () => {
  let server: TestServer | null = null;
  let conn: MCPConnection | null = null;
  let registry: MCPServersRegistry;

  beforeEach(async () => {
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;
    MCPServersRegistry.createInstance(mockMongoose, ['127.0.0.1']);
    registry = MCPServersRegistry.getInstance();
    await registryStatusCache.reset();
    await registry.reset();
    MCPServersInitializer.resetProcessFlag();
  });

  afterEach(async () => {
    await safeDisconnect(conn);
    conn = null;
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('should store a stub config when the MCP server is unreachable at startup', async () => {
    // Point to a port where nothing is listening — simulates a down server
    const deadPort = await getFreePort();
    const configs: t.MCPServers = {
      'speedy-mcp': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    await MCPServersInitializer.initialize(configs);

    // Before the fix: getServerConfig would return undefined here
    // After the fix: a stub with inspectionFailed=true is stored
    const config = await registry.getServerConfig('speedy-mcp');
    expect(config).toBeDefined();
    expect(config!.inspectionFailed).toBe(true);
    expect(config!.url).toBe(`http://127.0.0.1:${deadPort}/`);
    // No tools or capabilities since inspection failed
    expect(config!.tools).toBeUndefined();
    expect(config!.capabilities).toBeUndefined();
    expect(config!.toolFunctions).toBeUndefined();
  });

  it('should recover via reinspectServer after the MCP server comes back online', async () => {
    // Phase 1: Server is down at startup
    const deadPort = await getFreePort();
    const configs: t.MCPServers = {
      'speedy-mcp': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    await MCPServersInitializer.initialize(configs);

    const stubConfig = await registry.getServerConfig('speedy-mcp');
    expect(stubConfig).toBeDefined();
    expect(stubConfig!.inspectionFailed).toBe(true);

    // Phase 2: Start the real server — but on a DIFFERENT port.
    // To simulate "server comes back", we need the URL to match.
    // So start the server on the dead port.
    server = await createMCPServerOnPort(deadPort);

    // Phase 3: Reinspect — this is what the reinitialize button triggers
    const result = await registry.reinspectServer('speedy-mcp', 'CACHE');

    // Verify the stub was replaced with a fully inspected config
    expect(result.config.inspectionFailed).toBeUndefined();
    expect(result.config.tools).toContain('echo');
    expect(result.config.tools).toContain('greet');
    expect(result.config.capabilities).toBeDefined();
    expect(result.config.toolFunctions).toBeDefined();

    // Verify the registry now returns the real config
    const realConfig = await registry.getServerConfig('speedy-mcp');
    expect(realConfig).toBeDefined();
    expect(realConfig!.inspectionFailed).toBeUndefined();
    expect(realConfig!.tools).toContain('echo');
  });

  it('should allow a real client connection after reinspection succeeds', async () => {
    // Phase 1: Server is down at startup
    const deadPort = await getFreePort();
    const configs: t.MCPServers = {
      'speedy-mcp': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    await MCPServersInitializer.initialize(configs);
    expect((await registry.getServerConfig('speedy-mcp'))!.inspectionFailed).toBe(true);

    // Phase 2: Server comes back online
    server = await createMCPServerOnPort(deadPort);

    // Phase 3: Reinspect
    await registry.reinspectServer('speedy-mcp', 'CACHE');

    // Phase 4: Establish a real client connection — this is what getUserConnection does
    conn = new MCPConnection({
      serverName: 'speedy-mcp',
      serverConfig: { type: 'streamable-http', url: server.url },
      useSSRFProtection: false,
    });

    await conn.connect();
    const tools = await conn.fetchTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('echo');
    expect(tools.map((t) => t.name)).toContain('greet');
  });

  it('should not negative-cache undefined DB results, allowing recovery', async () => {
    // Query a server that doesn't exist at all — not even a stub
    const config1 = await registry.getServerConfig('nonexistent');
    expect(config1).toBeUndefined();

    // Now add the server to cache (simulating it being registered after recovery)
    server = await createMCPServer();
    await registry.addServer('nonexistent', { type: 'streamable-http', url: server.url }, 'CACHE');

    // The second lookup should find the newly added config
    // Before the fix: would return undefined due to negative caching
    const config2 = await registry.getServerConfig('nonexistent');
    expect(config2).toBeDefined();
    expect(config2!.tools).toContain('echo');
  });

  it('reinspectServer should throw when the server is still unreachable', async () => {
    // Server is down at startup
    const deadPort = await getFreePort();
    const configs: t.MCPServers = {
      'still-broken': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    await MCPServersInitializer.initialize(configs);
    expect((await registry.getServerConfig('still-broken'))!.inspectionFailed).toBe(true);

    // Server is STILL down — reinspection should fail
    await expect(registry.reinspectServer('still-broken', 'CACHE')).rejects.toThrow();

    // The stub should remain intact for future retry
    const config = await registry.getServerConfig('still-broken');
    expect(config).toBeDefined();
    expect(config!.inspectionFailed).toBe(true);
  });
});

/** Creates an MCP server listening on a specific port (for simulating recovery on same URL) */
async function createMCPServerOnPort(port: number): Promise<TestServer> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: 'recovery-test-server', version: '0.0.1' });
      mcp.tool('echo', 'Echo tool for testing', {}, async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }));
      mcp.tool('greet', 'Greeting tool', {}, async () => ({
        content: [{ type: 'text', text: 'hello' }],
      }));
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);

    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport!.sessionId!);
    }
  });

  const destroySockets = trackSockets(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    close: async () => {
      const closing = [...sessions.values()].map((t) => t.close().catch(() => undefined));
      sessions.clear();
      await Promise.all(closing);
      await destroySockets();
    },
  };
}
