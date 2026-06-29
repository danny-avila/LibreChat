const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const {
  getUserMCPAuthMap,
  readAppResource,
  listAppResources,
  listAppResourceTemplates,
  callAppTool,
} = require('@librechat/api');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config');
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
  // Fail closed on config resolution: an app request targets one server by name, so a transient
  // failure must reject rather than fall back to the base config for that name and proxy to the
  // wrong server. Auth map resolution may still degrade, since a missing var fails closed downstream.
  const [configServers, userMCPAuthMap] = await Promise.all([
    resolveConfigServers(req, { throwOnError: true }),
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
    const ctx = {
      userId,
      serverName,
      user: req.user,
      ...(await resolveAppContext(req, serverName)),
    };
    const result = await readAppResource(getMCPManager(), ctx, uri);
    return res.json(result);
  } catch (error) {
    // A denied read (non-advertised / non-ui:// resource) is an expected client error, not a
    // backend failure, so return 400 and skip the error-level log, mirroring appToolCall.
    if (error && typeof error === 'object' && error.code === MCP_INVALID_REQUEST) {
      return res.status(400).json({ error: error.message });
    }
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
    const ctx = {
      userId,
      serverName,
      user: req.user,
      ...(await resolveAppContext(req, serverName)),
    };
    const result = await listAppResources(getMCPManager(), ctx, cursor);
    return res.json(result);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === MCP_INVALID_REQUEST) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('[listMCPResources] Error:', error);
    return res.status(500).json({ error: 'Failed to list resources' });
  }
};

/** @route POST /api/mcp/resources/templates/list */
const listMCPResourceTemplates = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { serverName, cursor } = req.body;
    const ctx = {
      userId,
      serverName,
      user: req.user,
      ...(await resolveAppContext(req, serverName)),
    };
    const result = await listAppResourceTemplates(getMCPManager(), ctx, cursor);
    return res.json(result);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === MCP_INVALID_REQUEST) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('[listMCPResourceTemplates] Error:', error);
    return res.status(500).json({ error: 'Failed to list resource templates' });
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
    const ctx = {
      userId,
      serverName,
      user: req.user,
      ...(await resolveAppContext(req, serverName)),
    };
    const result = await callAppTool(getMCPManager(), ctx, toolName, toolArgs);
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

/**
 * Blocks MCP App endpoints when an admin has disabled apps via `mcpSettings.apps: false`.
 * Defense-in-depth alongside the connection-level capability gate: even if a server still
 * advertises UI tools, the host refuses to proxy resource reads and app tool calls while off.
 */
const requireMCPAppsEnabled = async (req, res, next) => {
  try {
    const appConfig =
      req.config ??
      (await getAppConfig({
        role: req.user?.role,
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
      }));
    if (appConfig?.mcpSettings?.apps === false) {
      return res.status(403).json({ error: 'MCP Apps are disabled' });
    }
    return next();
  } catch (error) {
    logger.error('[requireMCPAppsEnabled] Error:', error);
    return res.status(500).json({ error: 'Failed to resolve MCP Apps configuration' });
  }
};

module.exports = {
  readMCPResource,
  listMCPResources,
  listMCPResourceTemplates,
  appToolCall,
  serveMCPSandbox,
  requireMCPAppsEnabled,
};
