import express from 'express';
import { EventSource } from 'eventsource';
import { MCPConnection } from '../connection';
import type { MCPOptions } from '../types/mcp';

// Set up EventSource for Node environment
global.EventSource = EventSource;

const app = express();
app.use(express.json());

let mcp: MCPConnection;

const initializeMCP = async () => {
  console.log('Initializing MCP with SSE transport...');

  const mcpOptions: MCPOptions = {
    transport: {
      type: 'sse' as const,
      url: 'http://localhost:3001/sse',
      // type: 'stdio' as const,
      // 'command': 'npx',
      // 'args': [
      //   '-y',
      //   '@modelcontextprotocol/server-everything',
      // ],
    },
  };

  try {
    await MCPConnection.destroyInstance();
    mcp = MCPConnection.getInstance(mcpOptions);

    mcp.on('connectionChange', (state) => {
      console.log(`MCP connection state changed to: ${state}`);
    });

    mcp.on('error', (error) => {
      console.error('MCP error:', error);
    });

    console.log('Connecting to MCP server...');
    await mcp.connectClient();
    console.log('Connected to MCP server');

    // Test the connection
    try {
      const resources = await mcp.fetchResources();
      console.log('Available resources:', resources);
    } catch (error) {
      console.error('Error fetching resources:', error);
    }
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
  }
};

// API Endpoints
app.get('/status', (req, res) => {
  res.json({
    connected: mcp.isConnected(),
    state: mcp.getConnectionState(),
    error: mcp.getLastError()?.message,
  });
});

// Resources endpoint
app.get('/resources', async (req, res) => {
  try {
    const resources = await mcp.fetchResources();
    res.json({ resources });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Tools endpoint with all tool operations
app.get('/tools', async (req, res) => {
  try {
    const tools = await mcp.fetchTools();
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Echo tool endpoint
app.post('/tools/echo', async (req, res) => {
  try {
    const { message } = req.body;
    const result = await mcp.client.callTool({
      name: 'echo',
      arguments: { message },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Add tool endpoint
app.post('/tools/add', async (req, res) => {
  try {
    const { a, b } = req.body;
    const result = await mcp.client.callTool({
      name: 'add',
      arguments: { a, b },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Long running operation endpoint
app.post('/tools/long-operation', async (req, res) => {
  try {
    const { duration, steps } = req.body;
    const result = await mcp.client.callTool({
      name: 'longRunningOperation',
      arguments: { duration, steps },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Sample LLM endpoint
app.post('/tools/sample', async (req, res) => {
  try {
    const { prompt, maxTokens } = req.body;
    const result = await mcp.client.callTool({
      name: 'sampleLLM',
      arguments: { prompt, maxTokens },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get tiny image endpoint
app.get('/tools/tiny-image', async (req, res) => {
  try {
    const result = await mcp.client.callTool({
      name: 'getTinyImage',
      arguments: {},
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Prompts endpoints
app.get('/prompts', async (req, res) => {
  try {
    const prompts = await mcp.fetchPrompts();
    res.json({ prompts });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/prompts/simple', async (req, res) => {
  try {
    const result = await mcp.client.getPrompt({
      name: 'simple_prompt',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/prompts/complex', async (req, res) => {
  try {
    const { temperature, style } = req.body;
    const result = await mcp.client.getPrompt({
      name: 'complex_prompt',
      arguments: { temperature, style },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Resource subscription endpoints
app.post('/resources/subscribe', async (req, res) => {
  try {
    const { uri } = req.body;
    await mcp.client.subscribeResource({ uri });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/resources/unsubscribe', async (req, res) => {
  try {
    const { uri } = req.body;
    await mcp.client.unsubscribeResource({ uri });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Error handling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  await MCPConnection.destroyInstance();
  process.exit(0);
});

// Start server
const PORT = process.env.MCP_PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initializeMCP();
});
