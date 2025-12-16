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
} = require('~/server/services/Config');
const { getMCPManager } = require('~/config');
const { mcpServersRegistry } = require('@librechat/api');

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

    const cachePromises = configuredServers.map((serverName) =>
      getMCPServerTools(userId, serverName).then((tools) => ({ serverName, tools })),
    );
    const cacheResults = await Promise.all(cachePromises);

    const serverToolsMap = new Map();
    for (const { serverName, tools } of cacheResults) {
      if (tools) {
        serverToolsMap.set(serverName, tools);
        continue;
      }

      let serverTools;
      try {
        serverTools = await mcpManager.getServerToolFunctions(userId, serverName);
      } catch (error) {
        logger.error(`[getMCPTools] Error fetching tools for server ${serverName}:`, error);
        continue;
      }
      if (!serverTools) {
        logger.debug(`[getMCPTools] No tools found for server ${serverName}`);
        continue;
      }
      serverToolsMap.set(serverName, serverTools);

      if (Object.keys(serverTools).length > 0) {
        // Cache asynchronously without blocking
        cacheMCPServerTools({ userId, serverName, serverTools }).catch((err) =>
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
        const rawServerConfig = await mcpServersRegistry.getServerConfig(serverName, userId);

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
            server.tools.push({
              name: toolName,
              pluginKey: toolKey,
              description: toolData.function.description || '',
            });
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

    res.status(200).json({ servers: mcpServers });
  } catch (error) {
    logger.error('[getMCPTools]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
};
