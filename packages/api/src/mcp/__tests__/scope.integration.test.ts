import { z } from 'zod';
import * as http from 'http';
import { Agent } from 'undici';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IUser } from '@librechat/data-schemas';
import type { Socket } from 'net';
import type { ParsedServerConfig, RequestScopedMCPConnectionStore } from '~/mcp/types';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPRequestContext } from '~/mcp/request';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import { createMCPRequestContext, cleanupMCPRequestContext } from '~/mcp/request';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { getFreePort } from '~/mcp/__tests__/helpers/oauthTestServer';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(() => undefined),
  tenantStorage: {
    getStore: jest.fn(() => undefined),
    run: jest.fn((_context: object, fn: () => unknown) => fn()),
  },
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  isOAuthUrlAllowed: jest.fn(() => false),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

jest.mock('~/auth/domain', () => ({
  isMCPDomainAllowed: jest.fn(async () => true),
}));

interface RequestScopedTestServer {
  url: string;
  brokenUrl: string;
  close: () => Promise<void>;
  deleteCount: () => number;
  liveSessionCount: () => number;
  sessionsCreated: () => number;
  toolCallCount: () => number;
  observedRunIds: () => string[];
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

async function createRequestScopedTestServer(): Promise<RequestScopedTestServer> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const runIds: string[] = [];
  let created = 0;
  let deletes = 0;
  let toolCalls = 0;

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/broken') {
      res.writeHead(500).end('broken MCP');
      return;
    }

    if (req.method === 'POST') {
      const runId = req.headers['x-run-id'];
      if (typeof runId === 'string') {
        runIds.push(runId);
      }
    } else if (req.method === 'DELETE') {
      deletes += 1;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    const isNewTransport = !transport;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: 'request-scoped-test', version: '0.0.1' });
      mcp.tool('echo', 'Echo a value', { value: z.string() }, async ({ value }) => {
        toolCalls += 1;
        return { content: [{ type: 'text', text: value }] };
      });
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);

    if (isNewTransport && transport.sessionId) {
      created += 1;
      const registeredId = transport.sessionId;
      sessions.set(registeredId, transport);
      transport.onclose = () => sessions.delete(registeredId);
    }
  });

  const destroySockets = trackSockets(httpServer);
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    brokenUrl: `http://127.0.0.1:${port}/broken`,
    deleteCount: () => deletes,
    liveSessionCount: () => sessions.size,
    sessionsCreated: () => created,
    toolCallCount: () => toolCalls,
    observedRunIds: () => [...runIds],
    close: async () => {
      const closing = [...sessions.values()].map((transport) =>
        transport.close().catch(() => undefined),
      );
      sessions.clear();
      await Promise.all(closing);
      await destroySockets();
    },
  };
}

const user = { id: 'scale-user', role: 'USER' } as unknown as IUser;
const flowManager = {} as FlowStateManager<MCPOAuthTokens | null>;

function createManager(): MCPManager {
  const manager = new MCPManager();
  manager.appConnections = {
    has: jest.fn(async () => false),
    getConnectionCount: jest.fn(() => 0),
  } as unknown as ConnectionsRepository;
  return manager;
}

function createServerConfig(url: string): ParsedServerConfig {
  return {
    type: 'streamable-http',
    url,
    source: 'yaml',
    requiresOAuth: false,
    initTimeout: 500,
    headers: { 'X-Run-Id': '{{LIBRECHAT_BODY_MESSAGEID}}' },
  };
}

function callEcho({
  manager,
  config,
  requestScopedConnections,
  runId,
  value,
  serverName = 'request-scoped',
}: {
  manager: MCPManager;
  config: ParsedServerConfig;
  requestScopedConnections: RequestScopedMCPConnectionStore;
  runId: string;
  value: string;
  serverName?: string;
}) {
  return manager.callTool({
    user,
    serverName,
    serverConfig: config,
    toolName: 'echo',
    provider: 'openai',
    toolArguments: { value },
    requestBody: {
      conversationId: 'conversation-1',
      parentMessageId: 'parent-1',
      messageId: runId,
    },
    requestScopedConnections,
    flowManager,
  });
}

describe('request-scoped MCP lifecycle integration', () => {
  let server: RequestScopedTestServer;
  let manager: MCPManager;
  const contexts = new Set<MCPRequestContext>();

  beforeEach(async () => {
    server = await createRequestScopedTestServer();
    manager = createManager();
    jest.spyOn(MCPServersRegistry, 'getInstance').mockReturnValue({
      resolveAllowlists: jest.fn(async () => ({
        allowedDomains: null,
        allowedAddresses: null,
        useSSRFProtection: false,
      })),
    } as unknown as MCPServersRegistry);
  });

  afterEach(async () => {
    await Promise.all([...contexts].map((context) => cleanupMCPRequestContext(context)));
    contexts.clear();
    MCPConnection.clearCooldown('request-scoped');
    MCPConnection.clearCooldown('broken-request-scoped');
    jest.restoreAllMocks();
    await server.close();
  });

  function createContext(): MCPRequestContext {
    const context = createMCPRequestContext();
    contexts.add(context);
    return context;
  }

  it('coalesces a concurrent burst, tears down the run, and isolates the next run', async () => {
    const config = createServerConfig(server.url);
    const firstRun = createContext();
    const burstSize = 20;

    await Promise.all(
      Array.from({ length: burstSize }, (_, index) =>
        callEcho({
          manager,
          config,
          requestScopedConnections: firstRun,
          runId: 'run-1',
          value: `value-${index}`,
        }),
      ),
    );

    expect(server.sessionsCreated()).toBe(1);
    expect(server.liveSessionCount()).toBe(1);
    expect(server.toolCallCount()).toBe(burstSize);
    expect(new Set(server.observedRunIds())).toEqual(new Set(['run-1']));
    expect(manager.getConnectionStats().activityEntries).toBe(0);

    await cleanupMCPRequestContext(firstRun);
    contexts.delete(firstRun);

    expect(server.deleteCount()).toBe(1);
    expect(server.liveSessionCount()).toBe(0);

    const secondRun = createContext();
    await callEcho({
      manager,
      config,
      requestScopedConnections: secondRun,
      runId: 'run-2',
      value: 'second-run',
    });

    expect(server.sessionsCreated()).toBe(2);
    expect(server.liveSessionCount()).toBe(1);
    expect(new Set(server.observedRunIds())).toEqual(new Set(['run-1', 'run-2']));
  });

  it('clears a failed run so the same server can recover in a fresh run', async () => {
    const brokenRun = createContext();
    const destroyAgent = jest.spyOn(Agent.prototype, 'destroy');

    await expect(
      callEcho({
        manager,
        config: createServerConfig(server.brokenUrl),
        requestScopedConnections: brokenRun,
        runId: 'broken-run',
        value: 'unreachable',
        serverName: 'broken-request-scoped',
      }),
    ).rejects.toThrow();

    expect(brokenRun.connections.size).toBe(0);
    expect(brokenRun.pending.size).toBe(0);
    expect(manager.getConnectionStats().activityEntries).toBe(0);
    expect(destroyAgent).toHaveBeenCalled();

    const recoveryRun = createContext();
    await expect(
      callEcho({
        manager,
        config: createServerConfig(server.url),
        requestScopedConnections: recoveryRun,
        runId: 'recovery-run',
        value: 'recovered',
        serverName: 'broken-request-scoped',
      }),
    ).resolves.toBeDefined();

    expect(server.sessionsCreated()).toBe(1);
    expect(server.toolCallCount()).toBe(1);
    expect(new Set(server.observedRunIds())).toEqual(new Set(['recovery-run']));
  });
});
