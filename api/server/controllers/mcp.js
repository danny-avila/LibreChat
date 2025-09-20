/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 */
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { convertMCPToolToPlugin } = require('@librechat/api');
const { getAppConfig, getMCPServerTools } = require('~/server/services/Config');
const { getMCPManager } = require('~/config');

/**
 * Get all MCP tools available to the user
 * Returns only MCP tools, not regular LibreChat tools
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
      return res.status(200).json([]);
    }

    const mcpManager = getMCPManager();
    const configuredServers = Object.keys(appConfig.mcpConfig);
    const mcpTools = [];

    // Fetch tools from each configured server
    for (const serverName of configuredServers) {
      try {
        // First check server-specific cache
        let serverTools = await getMCPServerTools(serverName);

        if (!serverTools) {
          // If not cached, fetch from MCP manager
          const allTools = await mcpManager.getAllToolFunctions(userId);
          serverTools = {};

          // Filter tools for this specific server
          for (const [toolKey, toolData] of Object.entries(allTools)) {
            if (toolKey.endsWith(`${Constants.mcp_delimiter}${serverName}`)) {
              serverTools[toolKey] = toolData;
            }
          }

          // Cache server tools if found
          if (Object.keys(serverTools).length > 0) {
            const { cacheMCPServerTools } = require('~/server/services/Config');
            await cacheMCPServerTools({ serverName, serverTools });
          }
        }

        // Convert to plugin format
        for (const [toolKey, toolData] of Object.entries(serverTools)) {
          const plugin = convertMCPToolToPlugin({
            toolKey,
            toolData,
            mcpManager,
          });

          if (plugin) {
            // Add authentication config from server config
            const serverConfig = appConfig.mcpConfig[serverName];
            if (serverConfig?.customUserVars) {
              const customVarKeys = Object.keys(serverConfig.customUserVars);
              if (customVarKeys.length === 0) {
                plugin.authConfig = [];
                plugin.authenticated = true;
              } else {
                plugin.authConfig = Object.entries(serverConfig.customUserVars).map(
                  ([key, value]) => ({
                    authField: key,
                    label: value.title || key,
                    description: value.description || '',
                  }),
                );
                plugin.authenticated = false;
              }
            } else {
              plugin.authConfig = [];
              plugin.authenticated = true;
            }

            mcpTools.push(plugin);
          }
        }
      } catch (error) {
        logger.error(`[getMCPTools] Error loading tools for server ${serverName}:`, error);
      }
    }

    res.status(200).json(mcpTools);
  } catch (error) {
    logger.error('[getMCPTools]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
};
