const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const {
  getToolkitKey,
  checkPluginAuth,
  filterUniquePlugins,
  convertMCPToolsToPlugins,
} = require('@librechat/api');
const { getCustomConfig, getCachedTools } = require('~/server/services/Config');
const { availableTools, toolkits } = require('~/app/clients/tools');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');

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
      logger.debug(`MCP tools for ${serverName} added to cache.`);
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
    const userPlugins = convertMCPToolsToPlugins({ functionTools: cachedUserTools, customConfig });

    if (cachedToolsArray != null && userPlugins != null) {
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
        Object.keys(toolDefinitions).some(
          (key) => getToolkitKey({ toolkits, toolName: key }) === plugin.pluginKey,
        );

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

      if (!serverConfig?.customUserVars) {
        toolsOutput.push(toolToAdd);
        continue;
      }

      const customVarKeys = Object.keys(serverConfig.customUserVars);

      if (customVarKeys.length === 0) {
        toolToAdd.authConfig = [];
        toolToAdd.authenticated = true;
      } else {
        toolToAdd.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
          authField: key,
          label: value.title || key,
          description: value.description || '',
        }));
        toolToAdd.authenticated = false;
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

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
