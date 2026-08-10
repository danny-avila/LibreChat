const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const {
  readAppResource,
  listAppResources,
  listAppResourceTemplates,
  callAppTool,
  buildSandboxResponse,
  isDeniedAppRequest,
  buildAppProxyErrorResponse,
  resolveAppRequestContext,
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

const SANDBOX_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'client',
  'public',
  'mcp-sandbox.html',
);

const resolveAppContext = (req, serverName) =>
  resolveAppRequestContext({
    userId: req.user?.id,
    serverName,
    user: req.user,
    resolveConfigServers: () => resolveConfigServers(req, { throwOnError: true }),
    findPluginAuthsByKeys,
    flowManager: getFlowStateManager(getLogStores(CacheKeys.FLOWS)),
    tokenMethods: { findToken, createToken, updateToken, deleteTokens },
  });

const sendAppProxyError = (res, error, { label, fallback, logExpectedErrors = false }) => {
  if (logExpectedErrors || !isDeniedAppRequest(error)) {
    logger.error(`[${label}] Error:`, error);
  }
  const { status, body } = buildAppProxyErrorResponse(error, fallback);
  return res.status(status).json(body);
};

const createAppProxyHandler =
  ({ label, fallback, logExpectedErrors, proxy }) =>
  async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { serverName } = req.body;
      const result = await proxy(
        getMCPManager(),
        await resolveAppContext(req, serverName),
        req.body,
      );
      return res.json(result);
    } catch (error) {
      return sendAppProxyError(res, error, { label, fallback, logExpectedErrors });
    }
  };

/** @route POST /api/mcp/resources/read */
const readMCPResource = createAppProxyHandler({
  label: 'readMCPResource',
  fallback: 'Failed to read resource',
  proxy: (manager, ctx, body) => readAppResource(manager, ctx, body.uri),
});

/** @route POST /api/mcp/resources/list */
const listMCPResources = createAppProxyHandler({
  label: 'listMCPResources',
  fallback: 'Failed to list resources',
  proxy: (manager, ctx, body) => listAppResources(manager, ctx, body.cursor),
});

/** @route POST /api/mcp/resources/templates/list */
const listMCPResourceTemplates = createAppProxyHandler({
  label: 'listMCPResourceTemplates',
  fallback: 'Failed to list resource templates',
  proxy: (manager, ctx, body) => listAppResourceTemplates(manager, ctx, body.cursor),
});

/** @route POST /api/mcp/app-tool-call */
const appToolCall = createAppProxyHandler({
  label: 'appToolCall',
  fallback: 'Failed to execute tool',
  logExpectedErrors: true,
  proxy: (manager, ctx, body) => callAppTool(manager, ctx, body.toolName, body.arguments),
});

/** @route GET /api/mcp/sandbox */
const serveMCPSandbox = async (req, res) => {
  try {
    const query = req?.query ?? {};
    const { headers, body } = buildSandboxResponse({
      sandboxPath: SANDBOX_PATH,
      csp: query.csp,
      strictCsp: query.strictCsp,
    });
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    return res.send(body);
  } catch (error) {
    logger.error('[serveMCPSandbox] Error:', error);
    if (res.headersSent) {
      return res.end();
    }
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
