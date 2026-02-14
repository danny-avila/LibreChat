const path = require('path');
const { Constants } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config');
const { getMCPManager } = require('~/config');
const paths = require('~/config/paths');

const DEFAULT_MCP_APP_SETTINGS = Object.freeze({
  allowedConnectDomains: [],
  blockedDomains: [],
  maxHeight: 800,
  allowFullscreen: true,
});

function normalizeDomainEntry(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/\/+$/, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeDomainList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return Array.from(new Set(list.map(normalizeDomainEntry).filter(Boolean)));
}

function toHostname(value) {
  const normalized = normalizeDomainEntry(value);
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith('*.')) {
    return normalized.slice(2);
  }
  try {
    const parsed = new URL(normalized.includes('://') ? normalized : `https://${normalized}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return normalized;
  }
}

function isBlockedDomain(candidate, blockedDomains) {
  const normalizedCandidate = normalizeDomainEntry(candidate);
  if (!normalizedCandidate || blockedDomains.length === 0) {
    return false;
  }

  const candidateHost = toHostname(normalizedCandidate);

  return blockedDomains.some((blockedDomain) => {
    const normalizedBlocked = normalizeDomainEntry(blockedDomain);
    if (!normalizedBlocked) {
      return false;
    }

    if (normalizedBlocked === normalizedCandidate) {
      return true;
    }

    const blockedHost = toHostname(normalizedBlocked);
    if (!blockedHost || !candidateHost) {
      return false;
    }

    if (normalizedBlocked.startsWith('*.')) {
      return candidateHost === blockedHost || candidateHost.endsWith(`.${blockedHost}`);
    }

    return blockedHost === candidateHost;
  });
}

function mergeDomains(first = [], second = []) {
  return Array.from(new Set([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])]));
}

function filterBlockedDomains(domains, blockedDomains) {
  if (!Array.isArray(domains) || domains.length === 0) {
    return [];
  }
  return domains.filter((domain) => !isBlockedDomain(domain, blockedDomains));
}

function clampMaxHeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return DEFAULT_MCP_APP_SETTINGS.maxHeight;
  }
  return Math.min(2000, Math.max(100, Math.round(num)));
}

async function getMCPAppsConfig(role) {
  const appConfig = await getAppConfig({ role });
  const mcpSettings = appConfig?.mcpSettings ?? {};
  const appSettings = mcpSettings.appSettings ?? {};

  return {
    appsEnabled: mcpSettings.apps !== false,
    appSettings: {
      allowedConnectDomains: normalizeDomainList(appSettings.allowedConnectDomains),
      blockedDomains: normalizeDomainList(appSettings.blockedDomains),
      maxHeight: clampMaxHeight(appSettings.maxHeight),
      allowFullscreen: appSettings.allowFullscreen !== false,
    },
  };
}

function applyAppSettingsToResult(result, appSettings) {
  if (!result || !Array.isArray(result.contents) || result.contents.length === 0) {
    return result;
  }

  const blockedDomains = normalizeDomainList(appSettings.blockedDomains);
  const allowedConnectDomains = normalizeDomainList(appSettings.allowedConnectDomains);

  const contents = result.contents.map((content) => {
    if (!content || typeof content !== 'object') {
      return content;
    }

    const uri = typeof content.uri === 'string' ? content.uri : '';
    if (!uri.startsWith('ui://')) {
      return content;
    }

    const nextContent = { ...content };
    const meta = nextContent._meta != null && typeof nextContent._meta === 'object' ? { ...nextContent._meta } : {};
    const uiMeta = meta.ui != null && typeof meta.ui === 'object' ? { ...meta.ui } : {};
    const csp = uiMeta.csp != null && typeof uiMeta.csp === 'object' ? { ...uiMeta.csp } : {};

    const connectDomains = filterBlockedDomains(
      mergeDomains(csp.connectDomains, allowedConnectDomains),
      blockedDomains,
    );

    csp.resourceDomains = filterBlockedDomains(csp.resourceDomains, blockedDomains);
    csp.connectDomains = connectDomains;
    csp.frameDomains = filterBlockedDomains(csp.frameDomains, blockedDomains);
    csp.baseUriDomains = filterBlockedDomains(csp.baseUriDomains, blockedDomains);

    uiMeta.csp = csp;
    uiMeta.maxHeight = appSettings.maxHeight ?? DEFAULT_MCP_APP_SETTINGS.maxHeight;
    uiMeta.allowFullscreen = appSettings.allowFullscreen ?? DEFAULT_MCP_APP_SETTINGS.allowFullscreen;
    meta.ui = uiMeta;
    nextContent._meta = meta;

    return nextContent;
  });

  return { ...result, contents };
}

/**
 * Read a UI resource from an MCP server
 * @route POST /api/mcp/resources/read
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const readMCPResource = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appsEnabled, appSettings } = await getMCPAppsConfig(req.user?.role);
    if (!appsEnabled) {
      return res.status(403).json({ error: 'MCP Apps are disabled' });
    }

    const { serverName, uri } = req.body;
    if (!serverName || !uri) {
      return res.status(400).json({ error: 'serverName and uri are required' });
    }

    const mcpManager = getMCPManager();
    const result = await mcpManager.readResource(userId, serverName, uri);
    return res.json(applyAppSettingsToResult(result, appSettings));
  } catch (error) {
    logger.error('[readMCPResource] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to read resource' });
  }
};

/**
 * Bridge: proxy tool calls from MCP App iframe to MCP server
 * @route POST /api/mcp/app-tool-call
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const appToolCall = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appsEnabled } = await getMCPAppsConfig(req.user?.role);
    if (!appsEnabled) {
      return res.status(403).json({ error: 'MCP Apps are disabled' });
    }

    const { serverName, toolName, arguments: toolArgs } = req.body;
    if (!serverName || !toolName) {
      return res.status(400).json({ error: 'serverName and toolName are required' });
    }

    const mcpManager = getMCPManager();

    // Validate tool exists and is app-callable
    const allTools = await mcpManager.getAllToolsForServer(userId, serverName);
    const toolKey = `${toolName}${Constants.mcp_delimiter}${serverName}`;
    const toolData = allTools?.[toolKey];

    if (!toolData) {
      return res.status(404).json({ error: `Tool "${toolName}" not found on server "${serverName}"` });
    }

    const visibility = Array.isArray(toolData._meta?.ui?.visibility)
      ? toolData._meta.ui.visibility
      : ['model', 'app'];
    if (!visibility.includes('app')) {
      return res.status(403).json({ error: `Tool "${toolName}" is not callable by apps` });
    }

    const result = await mcpManager.appToolCall(userId, serverName, toolName, toolArgs || {});
    return res.json(result);
  } catch (error) {
    logger.error('[appToolCall] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute tool' });
  }
};

/**
 * Serve sandbox proxy HTML for MCP Apps.
 * @route GET /api/mcp/sandbox
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const serveMCPSandbox = async (req, res) => {
  try {
    const { appsEnabled } = await getMCPAppsConfig(req.user?.role);
    if (!appsEnabled) {
      return res.status(403).json({ error: 'MCP Apps are disabled' });
    }

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    const sandboxPath = path.join(paths.publicPath, 'mcp-sandbox.html');
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
    return res.status(500).json({ error: error.message || 'Failed to load MCP sandbox' });
  }
};

module.exports = { readMCPResource, appToolCall, serveMCPSandbox };
