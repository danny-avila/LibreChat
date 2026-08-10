const fs = require('fs');
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
 * Resolves the request-scoped config and auth context so app follow-up requests can reconnect to
 * config-sourced servers even when the original tool-call connection is gone.
 */
const resolveAppContext = async (req, serverName) => {
  const userId = req.user?.id;
  // Fail closed on both config and auth resolution: a transient lookup failure must reject rather
  // than fall back to the base config (wrong server) or to unresolved/stale credentials. A user who
  // genuinely has no vars still resolves to an empty map without throwing, so that path proceeds.
  const [configServers, userMCPAuthMap] = await Promise.all([
    resolveConfigServers(req, { throwOnError: true }),
    getUserMCPAuthMap({
      userId,
      servers: [serverName],
      findPluginAuthsByKeys,
      throwOnError: true,
    }).catch((err) => {
      logger.error(
        `[resolveAppContext] Failed to resolve MCP auth values for user ${userId}, server ${serverName}; failing closed`,
        err,
      );
      throw err;
    }),
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
    // A denied read is an expected client error, so return 400 and skip the error-level log.
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

const MAX_CSP_DOMAINS = 32;
const MAX_CSP_PARAM_LENGTH = 4096;
/** Replaced on the way out so the proxy can refuse to build a frame it has no response policy for. */
const CSP_APPLIED_PLACEHOLDER = '/*__CSP_APPLIED__*/';
const CSP_APPLIED_MARKER = 'window.__MCP_SANDBOX_CSP_APPLIED = true;';

const SANDBOX_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'client',
  'public',
  'mcp-sandbox.html',
);

/**
 * CSP3 host-source shape: optional http(s)/ws(s) scheme, optional wildcard subdomain prefix,
 * hostname characters, optional port (numeric or `*`), optional path. Rejects CSP keywords, schemes
 * with no host, and injection attempts.
 *
 * Keep in sync with `APP_LINK_HOST_PATTERN` in `client/src/utils/mcpApps.ts`: the host authorizes an
 * `openLink` only for declared sources this filter also emits into the enforced policy, so anything
 * the matcher accepts must be accepted here too.
 */
const SAFE_HOST_RE =
  /^(?:(?:https?|wss?):\/\/)?(?:\*\.)?[a-zA-Z0-9][a-zA-Z0-9\-.]*(?::(?:\d{1,5}|\*))?(?:\/[^\s;,'"?#]*)?$/i;

const toDomainList = (value) => {
  if (!Array.isArray(value)) {
    return '';
  }
  // Trim before testing and emit the trimmed form: joining the raw entry would put its surrounding
  // whitespace (a newline, for instance) into the header.
  return value
    .map((domain) => (typeof domain === 'string' ? domain.trim() : ''))
    .filter((domain) => domain && SAFE_HOST_RE.test(domain))
    .slice(0, MAX_CSP_DOMAINS)
    .join(' ');
};

const buildCspPolicy = (csp, strictCsp) => {
  const resourceDomains = toDomainList(csp.resourceDomains);
  const connectDomains = toDomainList(csp.connectDomains) || "'none'";
  const frameDomains = toDomainList(csp.frameDomains);

  const scriptSrc = strictCsp
    ? "script-src 'unsafe-inline' " + resourceDomains
    : "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: " + resourceDomains;

  return [
    "default-src 'none'",
    scriptSrc.trim(),
    ("style-src 'unsafe-inline' " + resourceDomains).trim(),
    'connect-src ' + connectDomains,
    // form-action does not fall back to default-src, so with allow-forms a form could post to
    // any origin; bound it to the declared egress allowlist ('none' when none is declared).
    'form-action ' + connectDomains,
    ('img-src data: blob: ' + resourceDomains).trim(),
    ('media-src ' + (resourceDomains || "'none'")).trim(),
    ('font-src ' + (resourceDomains || "'none'")).trim(),
    // The app document is installed by navigating the inner frame to a blob URL, so blob: is
    // unconditional: the spec's sample emits frame-src 'none' only because it installs the document
    // with document.write into about:blank. frameDomains widens it to declared nested iframes.
    ('frame-src blob: ' + frameDomains).trim(),
    // Workers are created from blob URLs and inherit this policy, which default-src 'none' blocks.
    ('worker-src blob: ' + resourceDomains).trim(),
    "object-src 'none'",
    'base-uri ' + (toDomainList(csp.baseUriDomains) || "'self'"),
  ].join('; ');
};

/** An unparseable, oversized, or repeated `csp` param yields the restrictive default policy. */
const parseCspParam = (raw) => {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CSP_PARAM_LENGTH) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (error) {
    logger.debug('[serveMCPSandbox] Ignoring unparseable csp parameter', error);
    return {};
  }
};

let cachedSandboxHtml = null;
const readSandboxHtml = () => {
  if (cachedSandboxHtml == null) {
    cachedSandboxHtml = fs.readFileSync(SANDBOX_PATH, 'utf8');
  }
  return cachedSandboxHtml;
};

/** @route GET /api/mcp/sandbox */
const serveMCPSandbox = async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Required, not merely hygienic: the per-resource policy below varies per request.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    // The MCP Apps spec requires the Host and Sandbox to have different origins for web hosts.
    // Default to same-origin framing; when a dedicated sandbox origin is deployed, the operator
    // lists the allowed host origin(s) so the host page can frame this sandbox cross-origin.
    const allowedParents = (process.env.MCP_SANDBOX_FRAME_ANCESTORS || '').trim();
    // Only accept scheme://host[:port] tokens. A raw value is interpolated into the CSP header, so
    // an unvalidated token containing ";" would inject an unrelated directive.
    const ancestors = allowedParents
      .split(/[\s,]+/)
      .filter((token) => /^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d{1,5})?$/.test(token))
      .join(' ');
    const ancestorsPolicy = ancestors
      ? `frame-ancestors 'self' ${ancestors}`
      : "frame-ancestors 'self'";
    if (ancestors) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    } else {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    const query = req?.query ?? {};
    const resourcePolicy = buildCspPolicy(parseCspParam(query.csp), query.strictCsp === '1');
    // frame-ancestors stays its own policy: CSP3 excludes it from the meta-element path, and
    // multiple policies intersect, so the resource policy cannot loosen it.
    res.setHeader('Content-Security-Policy', [ancestorsPolicy, resourcePolicy]);

    return res.send(readSandboxHtml().replace(CSP_APPLIED_PLACEHOLDER, CSP_APPLIED_MARKER));
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
