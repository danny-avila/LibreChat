const { logger } = require('@librechat/data-schemas');

const MCP_REQUEST_CONTEXT = Symbol.for('librechat.mcpRequestContext');

function createMCPRequestContext() {
  return {
    connections: new Map(),
    pending: new Map(),
    cleanupStarted: false,
  };
}

async function cleanupMCPRequestContext(context) {
  if (!context || context.cleanupStarted) {
    return;
  }
  context.cleanupStarted = true;

  const connections = new Set(context.connections.values());
  const pending = Array.from(context.pending.values());
  if (pending.length > 0) {
    const settled = await Promise.allSettled(pending);
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        connections.add(result.value);
      }
    }
  }

  await Promise.allSettled(
    Array.from(connections).map(async (connection) => {
      try {
        await connection.disconnect();
      } catch (error) {
        logger.warn('[MCP Request Context] Failed to disconnect request-scoped connection', error);
      }
    }),
  );

  context.connections.clear();
  context.pending.clear();
}

function getMCPRequestContext(req, res) {
  if (!req) {
    return undefined;
  }

  if (!req[MCP_REQUEST_CONTEXT]) {
    const context = createMCPRequestContext();
    req[MCP_REQUEST_CONTEXT] = context;

    const cleanup = () => {
      cleanupMCPRequestContext(context).catch((error) => {
        logger.warn('[MCP Request Context] Cleanup failed', error);
      });
    };
    res?.once?.('finish', cleanup);
    res?.once?.('close', cleanup);
  }

  return req[MCP_REQUEST_CONTEXT];
}

module.exports = {
  cleanupMCPRequestContext,
  createMCPRequestContext,
  getMCPRequestContext,
};
