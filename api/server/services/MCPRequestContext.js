const { logger } = require('@librechat/data-schemas');

const MCP_REQUEST_CONTEXT = Symbol.for('librechat.mcpRequestContext');

function createMCPRequestContext() {
  return {
    connections: new Map(),
    pending: new Map(),
    cleanupStarted: false,
    cleanupOnResponse: true,
    responseCleanupAttached: false,
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

function isResponseFinished(res) {
  return Boolean(res?.writableEnded || res?.finished || res?.destroyed);
}

function runCleanup(context) {
  cleanupMCPRequestContext(context).catch((error) => {
    logger.warn('[MCP Request Context] Cleanup failed', error);
  });
}

function attachResponseCleanup(context, res) {
  if (!res || context.responseCleanupAttached || context.cleanupOnResponse === false) {
    return;
  }

  const cleanup = () => runCleanup(context);
  if (isResponseFinished(res)) {
    cleanup();
    return;
  }

  if (typeof res.once !== 'function') {
    return;
  }

  context.responseCleanupAttached = true;
  res.once('finish', cleanup);
  res.once('close', cleanup);

  if (isResponseFinished(res)) {
    cleanup();
  }
}

function getMCPRequestContext(req, res, options = {}) {
  if (!req) {
    return undefined;
  }

  const cleanupOnResponse = options.cleanupOnResponse !== false;
  if (!req[MCP_REQUEST_CONTEXT]) {
    if (cleanupOnResponse && isResponseFinished(res)) {
      return undefined;
    }

    const context = createMCPRequestContext();
    context.cleanupOnResponse = cleanupOnResponse;
    req[MCP_REQUEST_CONTEXT] = context;
  } else if (!cleanupOnResponse) {
    req[MCP_REQUEST_CONTEXT].cleanupOnResponse = false;
  }

  const context = req[MCP_REQUEST_CONTEXT];
  if (cleanupOnResponse) {
    attachResponseCleanup(context, res);
  }

  return context.cleanupStarted ? undefined : context;
}

async function cleanupMCPRequestContextForReq(req) {
  const context = req?.[MCP_REQUEST_CONTEXT];
  if (!context) {
    return;
  }

  try {
    await cleanupMCPRequestContext(context);
  } finally {
    delete req[MCP_REQUEST_CONTEXT];
  }
}

module.exports = {
  cleanupMCPRequestContextForReq,
  cleanupMCPRequestContext,
  createMCPRequestContext,
  getMCPRequestContext,
};
