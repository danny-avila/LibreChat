const { logger } = require('@librechat/data-schemas');
const { CacheKeys, AuthType, Constants } = require('librechat-data-provider');
const { getCustomConfig, getCachedTools } = require('~/server/services/Config');
const { getToolkitKey } = require('~/server/services/ToolService');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { availableTools } = require('~/app/clients/tools');
const { getLogStores } = require('~/cache');

/**
 * Filters out duplicate plugins from the list of plugins.
 *
 * @param {TPlugin[]} plugins The list of plugins to filter.
 * @returns {TPlugin[]} The list of plugins with duplicates removed.
 */
const filterUniquePlugins = (plugins) => {
  const seen = new Set();
  return plugins.filter((plugin) => {
    const duplicate = seen.has(plugin.pluginKey);
    seen.add(plugin.pluginKey);
    return !duplicate;
  });
};

/**
 * Determines if a plugin is authenticated by checking if all required authentication fields have non-empty values.
 * Supports alternate authentication fields, allowing validation against multiple possible environment variables.
 *
 * @param {TPlugin} plugin The plugin object containing the authentication configuration.
 * @returns {boolean} True if the plugin is authenticated for all required fields, false otherwise.
 */
const checkPluginAuth = (plugin) => {
  if (!plugin.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const authFieldOptions = authFieldObj.authField.split('||');
    let isFieldAuthenticated = false;

    for (const fieldOption of authFieldOptions) {
      const envValue = process.env[fieldOption];
      if (envValue && envValue.trim() !== '' && envValue !== AuthType.USER_PROVIDED) {
        isFieldAuthenticated = true;
        break;
      }
    }

    return isFieldAuthenticated;
  });
};

const getAvailablePluginsController = async (req, res) => {
  try {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedPlugins = await cache.get(CacheKeys.PLUGINS);
    if (cachedPlugins) {
      res.status(200).json(cachedPlugins);
      return;
    }

    /** @type {{ filteredTools: string[], includedTools: string[] }} */
    const { filteredTools = [], includedTools = [] } = req.app.locals;
    const pluginManifest = availableTools;

    const uniquePlugins = filterUniquePlugins(pluginManifest);
    let authenticatedPlugins = [];
    for (const plugin of uniquePlugins) {
      authenticatedPlugins.push(
        checkPluginAuth(plugin) ? { ...plugin, authenticated: true } : plugin,
      );
    }

    let plugins = authenticatedPlugins;

    if (includedTools.length > 0) {
      plugins = plugins.filter((plugin) => includedTools.includes(plugin.pluginKey));
    } else {
      plugins = plugins.filter((plugin) => !filteredTools.includes(plugin.pluginKey));
    }

    await cache.set(CacheKeys.PLUGINS, plugins);
    res.status(200).json(plugins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function createServerToolsCallback() {
  /**
   * @param {string} serverName
   * @param {TPlugin[] | null} serverTools
   */
  return async function (serverName, serverTools) {
    try {
      const mcpToolsCache = getLogStores(CacheKeys.MCP_TOOLS);
      if (!serverName || !mcpToolsCache) {
        return;
      }
      await mcpToolsCache.set(serverName, serverTools);
      logger.warn(`MCP tools for ${serverName} added to cache.`);
    } catch (error) {
      logger.error('Error retrieving MCP tools from cache:', error);
    }
  };
}

function createGetServerTools() {
  /**
   * Retrieves cached server tools
   * @param {string} serverName
   * @returns {Promise<TPlugin[] | null>}
   */
  return async function (serverName) {
    try {
      const mcpToolsCache = getLogStores(CacheKeys.MCP_TOOLS);
      if (!mcpToolsCache) {
        return null;
      }
      return await mcpToolsCache.get(serverName);
    } catch (error) {
      logger.error('Error retrieving MCP tools from cache:', error);
      return null;
    }
  };
}

/**
 * Retrieves and returns a list of available tools, either from a cache or by reading a plugin manifest file.
 *
 * This function first attempts to retrieve the list of tools from a cache. If the tools are not found in the cache,
 * it reads a plugin manifest file, filters for unique plugins, and determines if each plugin is authenticated.
 * Only plugins that are marked as available in the application's local state are included in the final list.
 * The resulting list of tools is then cached and sent to the client.
 *
 * @param {object} req - The request object, containing information about the HTTP request.
 * @param {object} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const getAvailableTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    const customConfig = await getCustomConfig();
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedToolsArray = await cache.get(CacheKeys.TOOLS);
    const cachedUserTools = await getCachedTools({ userId });
    const userPlugins = await convertMCPToolsToPlugins(cachedUserTools, customConfig, userId);

    if (cachedToolsArray && userPlugins) {
      const dedupedTools = filterUniquePlugins([...userPlugins, ...cachedToolsArray]);
      res.status(200).json(dedupedTools);
      return;
    }

    // If not in cache, build from manifest
    let pluginManifest = availableTools;
    if (customConfig?.mcpServers != null) {
      const mcpManager = getMCPManager();
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = flowsCache ? getFlowStateManager(flowsCache) : null;
      const serverToolsCallback = createServerToolsCallback();
      const getServerTools = createGetServerTools();
      const mcpTools = await mcpManager.loadManifestTools({
        flowManager,
        serverToolsCallback,
        getServerTools,
      });
      pluginManifest = [...mcpTools, ...pluginManifest];
    }

    /** @type {TPlugin[]} */
    const uniquePlugins = filterUniquePlugins(pluginManifest);

    const authenticatedPlugins = uniquePlugins.map((plugin) => {
      if (checkPluginAuth(plugin)) {
        return { ...plugin, authenticated: true };
      } else {
        return plugin;
      }
    });

    const toolDefinitions = (await getCachedTools({ includeGlobal: true })) || {};

    const toolsOutput = [];
    for (const plugin of authenticatedPlugins) {
      const isToolDefined = toolDefinitions[plugin.pluginKey] !== undefined;
      const isToolkit =
        plugin.toolkit === true &&
        Object.keys(toolDefinitions).some((key) => getToolkitKey(key) === plugin.pluginKey);

      if (!isToolDefined && !isToolkit) {
        continue;
      }

      const toolToAdd = { ...plugin };

      if (!plugin.pluginKey.includes(Constants.mcp_delimiter)) {
        toolsOutput.push(toolToAdd);
        continue;
      }

      const parts = plugin.pluginKey.split(Constants.mcp_delimiter);
      const serverName = parts[parts.length - 1];
      const serverConfig = customConfig?.mcpServers?.[serverName];

      logger.warn(
        `[getAvailableTools] Processing MCP tool:`,
        JSON.stringify({
          pluginKey: plugin.pluginKey,
          serverName,
          hasServerConfig: !!serverConfig,
          hasCustomUserVars: !!serverConfig?.customUserVars,
        }),
      );

      if (!serverConfig) {
        logger.warn(
          `[getAvailableTools] No server config found for ${serverName}, skipping auth check`,
        );
        toolsOutput.push(toolToAdd);
        continue;
      }

      // Handle MCP servers with customUserVars (user-level auth required)
      if (serverConfig.customUserVars) {
        logger.warn(`[getAvailableTools] Processing user-level MCP server: ${serverName}`);

        // Build authConfig for MCP tools
        toolToAdd.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
          authField: key,
          label: value.title || key,
          description: value.description || '',
        }));

        // Check actual connection status for MCP tools with auth requirements
        if (userId) {
          try {
            const mcpManager = getMCPManager(userId);
            const connectionStatus = await mcpManager.getUserConnectionStatus(userId, serverName);
            toolToAdd.authenticated = connectionStatus.connected;
            logger.warn(`[getAvailableTools] User-level connection status for ${serverName}:`, {
              connected: connectionStatus.connected,
              hasConnection: connectionStatus.hasConnection,
            });
          } catch (error) {
            logger.error(
              `[getAvailableTools] Error checking connection status for ${serverName}:`,
              error,
            );
            toolToAdd.authenticated = false;
          }
        } else {
          // For non-authenticated requests, default to false
          toolToAdd.authenticated = false;
        }
      } else {
        // Handle app-level MCP servers (no auth required)
        logger.warn(`[getAvailableTools] Processing app-level MCP server: ${serverName}`);
        toolToAdd.authConfig = [];

        // Check if the app-level connection is active
        try {
          const mcpManager = getMCPManager();
          const allConnections = mcpManager.getAllConnections();
          logger.warn(`[getAvailableTools] All app-level connections:`, {
            connectionNames: Array.from(allConnections.keys()),
            serverName,
          });

          const appConnection = mcpManager.getConnection(serverName);
          logger.warn(`[getAvailableTools] Checking app-level connection for ${serverName}:`, {
            hasConnection: !!appConnection,
            connectionState: appConnection?.getConnectionState?.(),
          });

          if (appConnection) {
            const connectionState = appConnection.getConnectionState();
            logger.warn(`[getAvailableTools] App-level connection status for ${serverName}:`, {
              connectionState,
              hasConnection: !!appConnection,
            });

            // For app-level connections, consider them authenticated if they're in 'connected' state
            // This is more reliable than isConnected() which does network calls
            toolToAdd.authenticated = connectionState === 'connected';
            logger.warn(`[getAvailableTools] Final authenticated status for ${serverName}:`, {
              authenticated: toolToAdd.authenticated,
              connectionState,
            });
          } else {
            logger.warn(`[getAvailableTools] No app-level connection found for ${serverName}`);
            toolToAdd.authenticated = false;
          }
        } catch (error) {
          logger.error(
            `[getAvailableTools] Error checking app-level connection status for ${serverName}:`,
            error,
          );
          toolToAdd.authenticated = false;
        }
      }

      toolsOutput.push(toolToAdd);
    }
    const finalTools = filterUniquePlugins(toolsOutput);
    await cache.set(CacheKeys.TOOLS, finalTools);

    const dedupedTools = filterUniquePlugins([...userPlugins, ...finalTools]);

    res.status(200).json(dedupedTools);
  } catch (error) {
    logger.error('[getAvailableTools]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Converts MCP function format tools to plugin format
 * @param {Object} functionTools - Object with function format tools
 * @param {Object} customConfig - Custom configuration for MCP servers
 * @returns {Array} Array of plugin objects
 */
async function convertMCPToolsToPlugins(functionTools, customConfig, userId = null) {
  const plugins = [];

  for (const [toolKey, toolData] of Object.entries(functionTools)) {
    if (!toolData.function || !toolKey.includes(Constants.mcp_delimiter)) {
      continue;
    }

    const functionData = toolData.function;
    const parts = toolKey.split(Constants.mcp_delimiter);
    const serverName = parts[parts.length - 1];

    const plugin = {
      name: parts[0], // Use the tool name without server suffix
      pluginKey: toolKey,
      description: functionData.description || '',
      authenticated: false, // Default to false, will be updated based on connection status
      icon: undefined,
    };

    // Build authConfig for MCP tools
    const serverConfig = customConfig?.mcpServers?.[serverName];
    if (!serverConfig?.customUserVars) {
      plugin.authConfig = [];
      plugin.authenticated = true; // No auth required
      plugins.push(plugin);
      continue;
    }

    const customVarKeys = Object.keys(serverConfig.customUserVars);
    if (customVarKeys.length === 0) {
      plugin.authConfig = [];
      plugin.authenticated = true; // No auth required
    } else {
      plugin.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
        authField: key,
        label: value.title || key,
        description: value.description || '',
      }));

      // Check actual connection status for MCP tools with auth requirements
      if (userId) {
        try {
          const mcpManager = getMCPManager(userId);
          const connectionStatus = await mcpManager.getUserConnectionStatus(userId, serverName);
          plugin.authenticated = connectionStatus.connected;
        } catch (error) {
          logger.error(
            `[convertMCPToolsToPlugins] Error checking connection status for ${serverName}:`,
            error,
          );
          plugin.authenticated = false;
        }
      } else {
        plugin.authenticated = false;
      }
    }

    plugins.push(plugin);
  }

  return plugins;
}

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
