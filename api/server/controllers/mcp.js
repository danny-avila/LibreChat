/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 */
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const {
  cacheMCPServerTools,
  getMCPServerTools,
  getAppConfig,
  invalidateCachedTools,
} = require('~/server/services/Config');
const { getMCPManager } = require('~/config');

const SOURCE_KEYS = [
  'sourceServer',
  'serverName',
  'server',
  'originServer',
  'provider',
  'upstreamServer',
  'gatewayServer',
  'mcpServer',
  'collection',
  'namespace',
];
const VERSION_KEYS = ['version', 'toolVersion', 'build', 'release', 'appVersion'];
const DISPLAY_SEPARATORS = ['|', ' via ', '@'];

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : value ? String(value).trim() : null;

const extractVersion = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  for (const key of VERSION_KEYS) {
    const value = metadata[key];
    const normalized = normalizeString(
      typeof value === 'object' && value != null ? value.name ?? value.id ?? value.value : value,
    );
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const extractSourceFromTags = (tags) => {
  if (!tags) {
    return null;
  }

  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === 'string') {
        const match = tag.match(/(server|source|provider)[=:]\s*(.+)$/i);
        if (match?.[2]) {
          return match[2].trim();
        }
      }
    }
  } else if (typeof tags === 'object') {
    for (const value of Object.values(tags)) {
      const normalized = normalizeString(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
};

const extractSourceFromMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  for (const key of SOURCE_KEYS) {
    if (!(key in metadata)) {
      continue;
    }
    const value = metadata[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    } else if (typeof value === 'object' && value !== null) {
      const nested =
        normalizeString(value.name ?? value.id ?? value.slug ?? value.key) ||
        extractSourceFromMetadata(value);
      if (nested) {
        return nested;
      }
    }
  }

  const taggedSource = extractSourceFromTags(metadata.tags);
  if (taggedSource) {
    return taggedSource;
  }

  return null;
};

const splitDisplayName = (displayName) => {
  if (typeof displayName !== 'string') {
    return { displayName: '', source: null };
  }

  const trimmed = displayName.trim();
  for (const separator of DISPLAY_SEPARATORS) {
    const index = trimmed.indexOf(separator);
    if (index !== -1) {
      const head = trimmed.slice(0, index).trim();
      const tail = trimmed.slice(index + separator.length).trim();
      if (head && tail) {
        return {
          displayName: head.replace(/^@/, '').trim(),
          source: tail.replace(/^@/, '').trim(),
        };
      }
    }
  }

  return { displayName: trimmed, source: null };
};

/**
 * Get all MCP tools available to the user
 */
const getMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[getMCPTools] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const appConfig = req.config ?? (await getAppConfig({ role: req.user?.role }));
    if (!appConfig?.mcpConfig) {
      return res.status(200).json({ servers: {} });
    }

    const mcpManager = getMCPManager();
    const configuredServers = Object.keys(appConfig.mcpConfig);
    const mcpServers = {};
    const derivedServers = new Map();
    const bypassCache =
      req.query?.refresh === 'true' ||
      req.query?.refresh === '1' ||
      req.query?.refresh === 'yes';

    const cachePromises = configuredServers.map((serverName) => {
      if (bypassCache) {
        return Promise.resolve({ serverName, tools: null });
      }
      return getMCPServerTools(serverName).then((tools) => ({ serverName, tools }));
    });
    const cacheResults = await Promise.all(cachePromises);

    const serverToolsMap = new Map();
    for (const { serverName, tools } of cacheResults) {
      if (tools) {
        serverToolsMap.set(serverName, tools);
        continue;
      }

      if (bypassCache) {
        await invalidateCachedTools({ serverName });
      }

      const serverTools = await mcpManager.getServerToolFunctions(userId, serverName);
      if (!serverTools) {
        logger.debug(`[getMCPTools] No tools found for server ${serverName}`);
        continue;
      }
      serverToolsMap.set(serverName, serverTools);

      if (Object.keys(serverTools).length > 0) {
        // Cache asynchronously without blocking
        cacheMCPServerTools({ serverName, serverTools }).catch((err) =>
          logger.error(`[getMCPTools] Failed to cache tools for ${serverName}:`, err),
        );
      }
    }

    // Process each configured server
    for (const serverName of configuredServers) {
      try {
        const serverTools = serverToolsMap.get(serverName);

        // Get server config once
        const serverConfig = appConfig.mcpConfig[serverName];
        const rawServerConfig = mcpManager.getRawConfig(serverName);

        // Initialize server object with all server-level data
        const server = {
          name: serverName,
          icon: rawServerConfig?.iconPath || '',
          authenticated: true,
          authConfig: [],
          tools: [],
        };

        // Set authentication config once for the server
        if (serverConfig?.customUserVars) {
          const customVarKeys = Object.keys(serverConfig.customUserVars);
          if (customVarKeys.length > 0) {
            server.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
              authField: key,
              label: value.title || key,
              description: value.description || '',
            }));
            server.authenticated = false;
          }
        }

        // Process tools efficiently - no need for convertMCPToolToPlugin
        if (serverTools) {
          for (const [toolKey, toolData] of Object.entries(serverTools)) {
            if (!toolData.function || !toolKey.includes(Constants.mcp_delimiter)) {
              continue;
            }

            const toolName = toolKey.split(Constants.mcp_delimiter)[0];
            const metadata = toolData.function.metadata ?? {};
            let displayName =
              metadata.displayName ||
              metadata.title ||
              metadata.name ||
              toolData.function.name ||
              toolName;
            let source = extractSourceFromMetadata(metadata);
            const version = extractVersion(metadata);

            const splitResult = splitDisplayName(displayName);
            if (splitResult.displayName) {
              displayName = splitResult.displayName;
            }
            if (!source && splitResult.source) {
              source = splitResult.source;
            }

            const toolEntry = {
              name: displayName,
              pluginKey: toolKey,
              description: toolData.function.description || '',
              source: source || undefined,
              version: version || undefined,
              metadata,
            };

            server.tools.push(toolEntry);

            if (source && source !== serverName) {
              if (!derivedServers.has(source)) {
                derivedServers.set(source, {
                  name: source,
                  icon: server.icon,
                  authenticated: server.authenticated,
                  authConfig: server.authConfig,
                  tools: [],
                  parentServer: serverName,
                });
              }

              derivedServers.get(source).tools.push({
                ...toolEntry,
                source,
              });
            }
          }
        }

        // Only add server if it has tools or is configured
        if (server.tools.length > 0 || serverConfig) {
          mcpServers[serverName] = server;
        }
      } catch (error) {
        logger.error(`[getMCPTools] Error loading tools for server ${serverName}:`, error);
      }
    }

    for (const [derivedName, derivedServer] of derivedServers.entries()) {
      if (!mcpServers[derivedName]) {
        mcpServers[derivedName] = derivedServer;
      } else if (Array.isArray(derivedServer.tools) && derivedServer.tools.length > 0) {
        const existing = mcpServers[derivedName];
        existing.tools = Array.isArray(existing.tools)
          ? [...existing.tools, ...derivedServer.tools]
          : [...derivedServer.tools];
        if (!existing.parentServer && derivedServer.parentServer) {
          existing.parentServer = derivedServer.parentServer;
        }
      }
    }

    res.status(200).json({ servers: mcpServers });
  } catch (error) {
    logger.error('[getMCPTools]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
};
