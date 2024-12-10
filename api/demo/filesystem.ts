import express from 'express';
import { EventSource } from 'eventsource';
import { MCPConnectionSingleton } from 'librechat-mcp';
import type { MCPOptions } from 'librechat-mcp';

// Set up EventSource for Node environment
(global as any).EventSource = EventSource;

const app = express();
app.use(express.json());

let mcp: MCPConnectionSingleton;

const initializeMCP = async () => {
  console.log('Initializing MCP with SSE transport...');

  const mcpOptions: MCPOptions = {
    transport: {
      // type: 'sse' as const,
      // url: 'http://localhost:3001/sse',
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/danny/LibreChat/'],
    },
  };

  try {
    // Clean up any existing instance
    await MCPConnectionSingleton.destroyInstance();

    // Get singleton instance
    mcp = MCPConnectionSingleton.getInstance(mcpOptions);

    // Add event listeners
    mcp.on('connectionChange', (state) => {
      console.log(`MCP connection state changed to: ${state}`);
    });

    mcp.on('error', (error) => {
      console.error('MCP error:', error);
    });

    // Connect to server
    console.log('Connecting to MCP server...');
    await mcp.connectClient();
    console.log('Connected to MCP server');
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
  }
};

// Initialize MCP connection
initializeMCP();

// API Endpoints
app.get('/status', (req, res) => {
  res.json({
    connected: mcp.isConnected(),
    state: mcp.getConnectionState(),
    error: mcp.getLastError()?.message,
  });
});

app.get('/resources', async (req, res) => {
  try {
    const resources = await mcp.fetchResources();
    res.json({ resources });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/tools', async (req, res) => {
  try {
    const tools = await mcp.fetchTools();
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// File operations
// @ts-ignore
app.get('/files/read', async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'read_file',
      arguments: { path: filePath },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// @ts-ignore
app.post('/files/write', async (req, res) => {
  const { path, content } = req.body;
  if (!path || content === undefined) {
    return res.status(400).json({ error: 'Path and content are required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'write_file',
      arguments: { path, content },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// @ts-ignore
app.post('/files/edit', async (req, res) => {
  const { path, edits, dryRun = false } = req.body;
  if (!path || !edits) {
    return res.status(400).json({ error: 'Path and edits are required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'edit_file',
      arguments: { path, edits, dryRun },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Directory operations
// @ts-ignore
app.get('/directory/list', async (req, res) => {
  const dirPath = req.query.path as string;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'list_directory',
      arguments: { path: dirPath },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// @ts-ignore
app.post('/directory/create', async (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'create_directory',
      arguments: { path },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Search endpoint
// @ts-ignore
app.get('/search', async (req, res) => {
  const { path, pattern } = req.query;
  if (!path || !pattern) {
    return res.status(400).json({ error: 'Path and pattern parameters are required' });
  }

  try {
    const result = await mcp.client.callTool({
      name: 'search_files',
      arguments: { path, pattern },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
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
  await MCPConnectionSingleton.destroyInstance();
  process.exit(0);
});

// Start server
const PORT = process.env.MCP_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
