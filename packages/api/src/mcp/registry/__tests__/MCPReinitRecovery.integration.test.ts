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
import { Keyv } from 'keyv';
import { Agent } from 'undici';
import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IUser } from '@librechat/data-schemas';
import type { Socket } from 'net';
import type * as t from '~/mcp/types';
import { registryStatusCache } from '~/mcp/registry/cache/RegistryStatusCache';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPInspectionFailedError } from '~/mcp/errors';
import { FlowStateManager } from '~/flow/manager';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';

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
    // Reset MCPManager if it was created during the test
    try {
      const mgr = MCPManager.getInstance();
      await Promise.all(mgr.appConnections?.disconnectAll() ?? []);
    } catch {
      // Not initialized — nothing to clean up
    }
    (MCPManager as unknown as { instance: null }).instance = null;
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('should store a stub config when the MCP server is unreachable at startup', async () => {
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

    // Phase 2: Start the real server on the same (previously dead) port
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

    // Phase 2: Server comes back online on the same port
    server = await createMCPServerOnPort(deadPort);

    // Phase 3: Reinspect
    await registry.reinspectServer('speedy-mcp', 'CACHE');

    // Phase 4: Establish a real client connection
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

  it('should not attempt connections to stub servers via ConnectionsRepository', async () => {
    const deadPort = await getFreePort();
    await MCPServersInitializer.initialize({
      'stub-srv': { type: 'streamable-http', url: `http://127.0.0.1:${deadPort}/` },
    });
    expect((await registry.getServerConfig('stub-srv'))!.inspectionFailed).toBe(true);

    const repo = new ConnectionsRepository(undefined);
    expect(await repo.has('stub-srv')).toBe(false);
    expect(await repo.get('stub-srv')).toBeNull();

    const all = await repo.getAll();
    expect(all.has('stub-srv')).toBe(false);
  });

  it('addServerStub should clear negative read-through cache entries', async () => {
    // Query a server that doesn't exist — result is negative-cached
    const config1 = await registry.getServerConfig('late-server');
    expect(config1).toBeUndefined();

    // Store a stub (simulating a failed init that runs after the lookup)
    await registry.addServerStub(
      'late-server',
      { type: 'streamable-http', url: 'http://127.0.0.1:9999/' },
      'CACHE',
    );

    // The stub should be found despite the earlier negative cache entry
    const config2 = await registry.getServerConfig('late-server');
    expect(config2).toBeDefined();
    expect(config2!.inspectionFailed).toBe(true);
  });

  it('concurrent reinspectServer calls should not crash or corrupt state', async () => {
    const deadPort = await getFreePort();
    await MCPServersInitializer.initialize({
      'race-server': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    });
    expect((await registry.getServerConfig('race-server'))!.inspectionFailed).toBe(true);

    server = await createMCPServerOnPort(deadPort);

    // Simulate multiple users clicking Reinitialize at the same time.
    // reinitMCPServer calls reinspectServer internally — this tests the critical section.
    const n = 3 + Math.floor(Math.random() * 8); // 3–10 concurrent calls
    const results = await Promise.allSettled(
      Array.from({ length: n }, () => registry.reinspectServer('race-server', 'CACHE')),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // At least one must succeed
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Any failure must be the "not in a failed state" guard (the first call already
    // replaced the stub), not an unhandled crash or data corruption.
    for (const f of failures) {
      expect((f as PromiseRejectedResult).reason.message).toMatch(/not in a failed state/);
    }

    // Final state must be fully recovered regardless of how many succeeded
    const config = await registry.getServerConfig('race-server');
    expect(config).toBeDefined();
    expect(config!.inspectionFailed).toBeUndefined();
    expect(config!.tools).toContain('echo');
  });

  it('concurrent reinitMCPServer-equivalent flows should not crash or corrupt state', async () => {
    const deadPort = await getFreePort();
    const serverName = 'concurrent-reinit';
    const configs: t.MCPServers = {
      [serverName]: {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    // Reset MCPManager singleton so createInstance works
    (MCPManager as unknown as { instance: null }).instance = null;

    // Initialize with dead server — this sets up both registry (stub) and MCPManager
    await MCPManager.createInstance(configs);
    const mcpManager = MCPManager.getInstance();

    expect((await registry.getServerConfig(serverName))!.inspectionFailed).toBe(true);

    // Server comes back online
    server = await createMCPServerOnPort(deadPort);

    const flowManager = new FlowStateManager<null>(new Keyv(), { ttl: 60_000 });
    const makeUser = (): IUser =>
      ({
        _id: new Types.ObjectId(),
        id: new Types.ObjectId().toString(),
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test',
        avatar: '',
        provider: 'email',
        role: 'user',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as IUser;

    /**
     * Replicate reinitMCPServer logic: check inspectionFailed → reinspect → getConnection.
     * Each call uses a distinct user to simulate concurrent requests from different users.
     */
    async function simulateReinitMCPServer(): Promise<{ success: boolean; tools: number }> {
      const user = makeUser();
      const config = await registry.getServerConfig(serverName, user.id);
      if (config?.inspectionFailed) {
        try {
          const storageLocation = config.dbId ? 'DB' : 'CACHE';
          await registry.reinspectServer(serverName, storageLocation, user.id);
        } catch {
          // Mirrors reinitMCPServer early return on failed reinspection
          return { success: false, tools: 0 };
        }
      }

      const connection = await mcpManager.getConnection({
        serverName,
        user,
        flowManager,
        forceNew: true,
      });

      const tools = await connection.fetchTools();
      return { success: true, tools: tools.length };
    }

    const n = 3 + Math.floor(Math.random() * 5); // 3–7 concurrent calls
    const results = await Promise.allSettled(
      Array.from({ length: n }, () => simulateReinitMCPServer()),
    );

    // All promises should resolve (no unhandled throws)
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    const values = (results as PromiseFulfilledResult<{ success: boolean; tools: number }>[]).map(
      (r) => r.value,
    );

    // At least one full reinit must succeed with tools
    const succeeded = values.filter((v) => v.success);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const s of succeeded) {
      expect(s.tools).toBe(2);
    }

    // Any that returned success: false hit the reinspect guard — that's fine
    const earlyReturned = values.filter((v) => !v.success);
    expect(earlyReturned.every((v) => v.tools === 0)).toBe(true);

    // Final registry state must be fully recovered
    const finalConfig = await registry.getServerConfig(serverName);
    expect(finalConfig).toBeDefined();
    expect(finalConfig!.inspectionFailed).toBeUndefined();
    expect(finalConfig!.tools).toContain('echo');
  });

  it('reinspectServer should throw MCPInspectionFailedError when the server is still unreachable', async () => {
    const deadPort = await getFreePort();
    const configs: t.MCPServers = {
      'still-broken': {
        type: 'streamable-http',
        url: `http://127.0.0.1:${deadPort}/`,
      },
    };

    await MCPServersInitializer.initialize(configs);
    expect((await registry.getServerConfig('still-broken'))!.inspectionFailed).toBe(true);

    // Server is STILL down — reinspection should fail with MCPInspectionFailedError
    await expect(registry.reinspectServer('still-broken', 'CACHE')).rejects.toThrow(
      MCPInspectionFailedError,
    );

    // The stub should remain intact for future retry
    const config = await registry.getServerConfig('still-broken');
    expect(config).toBeDefined();
    expect(config!.inspectionFailed).toBe(true);
  });
});
