/**
 * Integration test for `notifications/tools/list_changed` (#7117).
 *
 * Real MCP server, real transport, real MCPConnection: a server that registers a tool after the
 * connection is up must make the client re-fetch, which is what kept dynamic tools invisible until
 * a restart. Only the app-layer cache write is stubbed, since that is the boundary the connection
 * layer deliberately does not reach across.
 */
import { z } from 'zod';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from 'node:http';
import { setMCPToolsChangedHandler, notifyMCPToolsChanged } from '../toolsChanged';
import { MCPConnection } from '../connection';

jest.setTimeout(30000);

/**
 * Waits for a condition instead of sleeping a fixed amount: the notification travels over a real
 * socket, so a fixed wait is a flake under parallel test load.
 */
async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the notification to arrive');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface RunningServer {
  url: string;
  addTool: (name: string) => void;
  close: () => Promise<void>;
}

async function startDynamicToolServer(): Promise<RunningServer> {
  const mcpServer = new McpServer(
    { name: 'dynamic-tool-server', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  mcpServer.registerTool(
    'initial_tool',
    { description: 'Present from the start', inputSchema: { value: z.string() } },
    async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await mcpServer.connect(transport);

  const app = express();
  app.use(express.json());
  app.all('/mcp', (req, res) => {
    void transport.handleRequest(req, res, req.body);
  });

  const httpServer: Server = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  const { port } = httpServer.address() as { port: number };

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    /* registerTool on a connected server emits notifications/tools/list_changed by itself - the
     * same thing a server building tools at runtime does. */
    addTool: (name: string) =>
      mcpServer.registerTool(
        name,
        { description: `Added at runtime: ${name}`, inputSchema: { value: z.string() } },
        async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      ),
    close: async () => {
      await mcpServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

describe('tools/list_changed', () => {
  let server: RunningServer;
  let connection: MCPConnection;

  afterEach(async () => {
    setMCPToolsChangedHandler(null);
    await connection?.disconnect();
    await server?.close();
  });

  it('re-fetches the tool list when the server adds a tool after connecting', async () => {
    server = await startDynamicToolServer();
    connection = new MCPConnection({
      serverName: 'dynamic',
      serverConfig: { type: 'streamable-http', url: server.url },
    });

    const changes: string[] = [];
    connection.on('toolsChanged', () => {
      changes.push('toolsChanged');
    });

    await connection.connect();
    const before = await connection.fetchTools();
    expect(before.map((tool) => tool.name)).toEqual(['initial_tool']);

    server.addTool('added_later');
    await waitFor(() => changes.length === 1);

    expect(changes).toEqual(['toolsChanged']);
    const after = await connection.fetchTools();
    expect(after.map((tool) => tool.name).sort()).toEqual(['added_later', 'initial_tool']);
  });

  it('routes the change to the registered handler with the server name', async () => {
    server = await startDynamicToolServer();
    connection = new MCPConnection({
      serverName: 'dynamic',
      serverConfig: { type: 'streamable-http', url: server.url },
    });

    const refreshed: Array<{ serverName: string; userId?: string }> = [];
    setMCPToolsChangedHandler((event) => {
      refreshed.push(event);
    });
    /* The repository wires this when it creates a connection; the connection itself only emits. */
    connection.on('toolsChanged', () => {
      void notifyMCPToolsChanged({ serverName: 'dynamic', userId: 'user-42' });
    });

    await connection.connect();
    /* One round-trip first: notifications only reach a client whose stream is up, and a real client
     * lists tools right after connecting anyway. */
    await connection.fetchTools();
    server.addTool('second_tool');
    await waitFor(() => refreshed.length === 1);

    expect(refreshed).toEqual([{ serverName: 'dynamic', userId: 'user-42' }]);
  });

  it('emits once per change, so several additions are each picked up', async () => {
    server = await startDynamicToolServer();
    connection = new MCPConnection({
      serverName: 'dynamic',
      serverConfig: { type: 'streamable-http', url: server.url },
    });

    let changes = 0;
    connection.on('toolsChanged', () => {
      changes++;
    });

    await connection.connect();
    await connection.fetchTools();
    server.addTool('one');
    server.addTool('two');
    await waitFor(() => changes === 2);

    expect(changes).toBe(2);
    const tools = await connection.fetchTools();
    expect(tools).toHaveLength(3);
  });
});
