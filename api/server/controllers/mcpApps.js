const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { getUserMCPAuthMap } = require('@librechat/api');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { resolveConfigServers } = require('~/server/services/MCP');
const {
  findPluginAuthsByKeys,
  findToken,
  createToken,
  updateToken,
  deleteTokens,
} = require('~/models');
const { getLogStores } = require('~/cache');

// MCP SDK ErrorCode.InvalidRequest = -32600
const MCP_INVALID_REQUEST = -32600;

/**
 * Resolves the request-scoped config, the user's custom variables, and the OAuth flow/token
 * context for a server so app follow-up requests can connect to config-sourced servers and
 * re-resolve credentialed or OAuth connections even when the original tool-call connection is gone.
 */
const resolveAppContext = async (req, serverName) => {
  const userId = req.user?.id;
  const [configServers, userMCPAuthMap] = await Promise.all([
    Promise.resolve()
      .then(() => resolveConfigServers(req))
      .catch(() => undefined),
    Promise.resolve()
      .then(() => getUserMCPAuthMap({ userId, servers: [serverName], findPluginAuthsByKeys }))
      .catch(() => undefined),
  ]);
  const customUserVars = userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];
  const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
  const tokenMethods = { findToken, createToken, updateToken, deleteTokens };
  return { configServers, customUserVars, flowManager, tokenMethods };
};

/** @route POST /api/mcp/resources/read */
const readMCPResource = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { serverName, uri } = req.body;
    if (!serverName || !uri) {
      return res.status(400).json({ error: 'serverName and uri are required' });
    }
    // The serverResources capability lets an app read any resource the connected MCP server
    // exposes (ui:// templates plus supporting data such as file:// or custom schemes), so the
    // proxy only requires a non-empty string and leaves resource authorization to the server.
    if (typeof uri !== 'string' || uri.length === 0) {
      return res.status(400).json({ error: 'uri must be a non-empty string' });
    }

    const mcpManager = getMCPManager();
    const { configServers, customUserVars, flowManager, tokenMethods } = await resolveAppContext(
      req,
      serverName,
    );
    const result = await mcpManager.readResource({
      userId,
      serverName,
      uri,
      user: req.user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });
    return res.json(result);
  } catch (error) {
    logger.error('[readMCPResource] Error:', error);
    return res.status(500).json({ error: 'Failed to read resource' });
  }
};

/** @route POST /api/mcp/resources/list */
const listMCPResources = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { serverName, cursor } = req.body;
    if (!serverName) {
      return res.status(400).json({ error: 'serverName is required' });
    }
    if (cursor !== undefined && typeof cursor !== 'string') {
      return res.status(400).json({ error: 'cursor must be a string' });
    }

    const mcpManager = getMCPManager();
    const { configServers, customUserVars, flowManager, tokenMethods } = await resolveAppContext(
      req,
      serverName,
    );
    const result = await mcpManager.listResources({
      userId,
      serverName,
      user: req.user,
      cursor,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });
    return res.json(result);
  } catch (error) {
    logger.error('[listMCPResources] Error:', error);
    return res.status(500).json({ error: 'Failed to list resources' });
  }
};

/** @route POST /api/mcp/app-tool-call */
const appToolCall = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { serverName, toolName, arguments: toolArgs } = req.body;
    if (!serverName || !toolName) {
      return res.status(400).json({ error: 'serverName and toolName are required' });
    }
    if (
      toolArgs !== undefined &&
      toolArgs !== null &&
      (typeof toolArgs !== 'object' || Array.isArray(toolArgs))
    ) {
      return res.status(400).json({ error: 'arguments must be an object' });
    }

    const mcpManager = getMCPManager();
    const { configServers, customUserVars, flowManager, tokenMethods } = await resolveAppContext(
      req,
      serverName,
    );
    const result = await mcpManager.appToolCall({
      userId,
      serverName,
      toolName,
      toolArguments: toolArgs || {},
      user: req.user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });
    return res.json(result);
  } catch (error) {
    logger.error('[appToolCall] Error:', error);
    if (error && typeof error === 'object' && error.code === MCP_INVALID_REQUEST) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to execute tool' });
  }
};

/** @route GET /api/mcp/sandbox */
const serveMCPSandbox = async (_req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    // The MCP Apps spec requires the Host and Sandbox to have different origins for web hosts.
    // Default to same-origin framing; when a dedicated sandbox origin is deployed, the operator
    // lists the allowed host origin(s) so the host page can frame this sandbox cross-origin.
    const allowedParents = (process.env.MCP_SANDBOX_FRAME_ANCESTORS || '').trim();
    if (allowedParents) {
      const ancestors = allowedParents
        .split(/[\s,]+/)
        .filter(Boolean)
        .join(' ');
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${ancestors}`);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    } else {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    const sandboxPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'client',
      'public',
      'mcp-sandbox.html',
    );
    return res.sendFile(sandboxPath, (error) => {
      if (error) {
        logger.error('[serveMCPSandbox] Error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to load MCP sandbox' });
        }
      }
    });
  } catch (error) {
    logger.error('[serveMCPSandbox] Error:', error);
    return res.status(500).json({ error: 'Failed to load MCP sandbox' });
  }
};

module.exports = { readMCPResource, listMCPResources, appToolCall, serveMCPSandbox };
