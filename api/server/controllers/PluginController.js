const { logger } = require('@librechat/data-schemas');
const { CacheKeys, AuthType } = require('librechat-data-provider');
const { getCustomConfig, getCachedTools } = require('~/server/services/Config');
const { getToolkitKey } = require('~/server/services/ToolService');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { availableTools } = require('~/app/clients/tools');
const { getLogStores } = require('~/cache');
const { Constants } = require('librechat-data-provider');

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
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedTools = await cache.get(CacheKeys.TOOLS);
    if (cachedTools) {
      res.status(200).json(cachedTools);
      return;
    }

    let pluginManifest = availableTools;
    const customConfig = await getCustomConfig();
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

    const toolDefinitions = await getCachedTools({ includeGlobal: true });

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
    res.status(200).json(finalTools);
  } catch (error) {
    logger.error('[getAvailableTools]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
