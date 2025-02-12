// server.ts
import express from 'express';
import { EventSource } from 'eventsource';
import { MCPManager } from '../manager';
import { MCPConnection } from '../connection';
import type * as t from '../types/mcp';

// Set up EventSource for Node environment
global.EventSource = EventSource;

const app = express();
app.use(express.json());

const mcpManager = MCPManager.getInstance();

const mcpServers: t.MCPServers = {
  everything: {
    type: 'sse' as const,
    url: 'http://localhost:3001/sse',
  },
  filesystem: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/danny/LibreChat/'],
  },
};

// Generic helper to get connection and handle errors
const withConnection = async (
  serverName: string,
  res: express.Response,
  callback: (connection: MCPConnection) => Promise<void>,
) => {
  const connection = mcpManager.getConnection(serverName);
  if (!connection) {
    return res.status(404).json({ error: `Server "${serverName}" not found` });
  }
  try {
    await callback(connection);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
};

// Common endpoints for all servers
// @ts-ignore
app.get('/status/:server', (req, res) => {
  const connection = mcpManager.getConnection(req.params.server);
  if (!connection) {
    return res.status(404).json({ error: 'Server not found' });
  }

  res.json({
    connected: connection.isConnected(),
    state: connection.getConnectionState(),
    error: connection.getLastError()?.message,
  });
});

app.get('/resources/:server', async (req, res) => {
  await withConnection(req.params.server, res, async (connection) => {
    const resources = await connection.fetchResources();
    res.json({ resources });
  });
});

app.get('/tools/:server', async (req, res) => {
  await withConnection(req.params.server, res, async (connection) => {
    const tools = await connection.fetchTools();
    res.json({ tools });
  });
});

// "Everything" server specific endpoints
app.post('/everything/tools/echo', async (req, res) => {
  await withConnection('everything', res, async (connection) => {
    const { message } = req.body;
    const result = await connection.client.callTool({
      name: 'echo',
      arguments: { message },
    });
    res.json(result);
  });
});

app.post('/everything/tools/add', async (req, res) => {
  await withConnection('everything', res, async (connection) => {
    const { a, b } = req.body;
    const result = await connection.client.callTool({
      name: 'add',
      arguments: { a, b },
    });
    res.json(result);
  });
});

app.post('/everything/tools/long-operation', async (req, res) => {
  await withConnection('everything', res, async (connection) => {
    const { duration, steps } = req.body;
    const result = await connection.client.callTool({
      name: 'longRunningOperation',
      arguments: { duration, steps },
    });
    res.json(result);
  });
});

// Filesystem server specific endpoints
// @ts-ignore
app.get('/filesystem/files/read', async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'read_file',
      arguments: { path: filePath },
    });
    res.json(result);
  });
});

// @ts-ignore
app.post('/filesystem/files/write', async (req, res) => {
  const { path, content } = req.body;
  if (!path || content === undefined) {
    return res.status(400).json({ error: 'Path and content are required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'write_file',
      arguments: { path, content },
    });
    res.json(result);
  });
});

// @ts-ignore
app.post('/filesystem/files/edit', async (req, res) => {
  const { path, edits, dryRun = false } = req.body;
  if (!path || !edits) {
    return res.status(400).json({ error: 'Path and edits are required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'edit_file',
      arguments: { path, edits, dryRun },
    });
    res.json(result);
  });
});

// @ts-ignore
app.get('/filesystem/directory/list', async (req, res) => {
  const dirPath = req.query.path as string;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'list_directory',
      arguments: { path: dirPath },
    });
    res.json(result);
  });
});

// @ts-ignore
app.post('/filesystem/directory/create', async (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'create_directory',
      arguments: { path },
    });
    res.json(result);
  });
});

// @ts-ignore
app.get('/filesystem/search', async (req, res) => {
  const { path, pattern } = req.query;
  if (!path || !pattern) {
    return res.status(400).json({ error: 'Path and pattern parameters are required' });
  }

  await withConnection('filesystem', res, async (connection) => {
    const result = await connection.client.callTool({
      name: 'search_files',
      arguments: { path, pattern },
    });
    res.json(result);
  });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await MCPManager.destroyInstance();
  process.exit(0);
});

// Start server
const PORT = process.env.MCP_PORT ?? 3000;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await mcpManager.initializeMCP(mcpServers);
});
