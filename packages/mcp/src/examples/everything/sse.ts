import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { createServer } from './everything.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { server, cleanup } = createServer();

let transport: SSEServerTransport | null = null;
let sessionId: string | null = null;
let isInitialized = false;

// Add CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.get('/sse', async (req, res) => {
  console.log('Received SSE connection request');

  try {
    // Clean up existing transport if any
    if (transport) {
      console.log('Cleaning up existing transport');
      isInitialized = false;
      await transport.close();
      transport = null;
      sessionId = null;
    }

    // Create new transport
    transport = new SSEServerTransport('/message', res);
    sessionId = transport.sessionId;
    console.log('Created transport with session ID:', sessionId);

    // Set up transport event handlers
    transport.onclose = () => {
      console.log('Transport closed');
      isInitialized = false;
      transport = null;
      sessionId = null;
    };

    transport.onerror = (error) => {
      console.error('Transport error:', error);
    };

    // Connect the server to the transport
    await server.connect(transport);
    isInitialized = true;
    console.log('Server connected to transport');

    // Keep the connection alive
    const keepAlive = setInterval(() => {
      try {
        if (transport && !res.writableEnded && isInitialized) {
          res.write('event: heartbeat\ndata: ping\n\n');
        } else {
          clearInterval(keepAlive);
        }
      } catch (error) {
        console.error('Error sending heartbeat:', error);
        clearInterval(keepAlive);
      }
    }, 15000);

    // Handle client disconnection
    req.on('close', async () => {
      console.log('Client disconnected');
      clearInterval(keepAlive);
      isInitialized = false;
      if (transport) {
        await transport.close();
        transport = null;
        sessionId = null;
      }
    });
  } catch (error) {
    console.error('SSE connection error:', error);
    isInitialized = false;
    if (transport) {
      await transport.close();
      transport = null;
      sessionId = null;
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
});

app.post('/message', async (req, res) => {
  try {
    const requestSessionId = req.query.sessionId as string;
    console.log('Received message for session:', requestSessionId);
    console.log('Current session:', sessionId);
    console.log('Is initialized:', isInitialized);
    console.log('Message body:', JSON.stringify(req.body, null, 2));

    if (!transport || !sessionId || !isInitialized) {
      throw new Error('No active SSE connection');
    }

    if (requestSessionId !== sessionId) {
      throw new Error(`Invalid session ID. Expected: ${sessionId}, Got: ${requestSessionId}`);
    }

    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Message handling error:', error);
    res.status(400).json({
      error: error.message,
      details: 'Failed to process message',
      currentSession: sessionId,
      requestedSession: req.query.sessionId,
      isInitialized,
    });
  }
});

// Handle server shutdown
async function shutdownServer() {
  console.log('Shutting down server...');
  isInitialized = false;
  if (transport) {
    await transport.close();
    transport = null;
    sessionId = null;
  }
  await cleanup();
  await server.close();
  process.exit(0);
}

// Cleanup handlers
process.on('SIGINT', shutdownServer);
process.on('SIGTERM', shutdownServer);

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

const PORT = process.env.MCP_PORT || 3001;
const httpServer = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

httpServer.on('error', (error) => {
  console.error('Server error:', error);
});
