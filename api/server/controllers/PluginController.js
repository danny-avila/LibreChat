const { logger } = require('@librechat/data-schemas');
const { getToolkitKey, checkPluginAuth, filterUniquePlugins } = require('@librechat/api');
const { getCachedTools, setCachedTools } = require('~/server/services/Config');
const { availableTools, toolkits } = require('~/app/clients/tools');
const { getAppConfig } = require('~/server/services/Config');

const getAvailablePluginsController = async (req, res) => {
  try {
    const appConfig = await getAppConfig({ role: req.user?.role, tenantId: req.user?.tenantId });
    /** @type {{ filteredTools: string[], includedTools: string[] }} */
    const { filteredTools = [], includedTools = [] } = appConfig;
    /** @type {import('@librechat/api').LCManifestTool[]} */
    const pluginManifest = availableTools;

    const uniquePlugins = filterUniquePlugins(pluginManifest);
    const authenticatedPlugins = uniquePlugins.map((plugin) =>
      checkPluginAuth(plugin) ? { ...plugin, authenticated: true } : plugin,
    );

    let plugins = authenticatedPlugins;

    if (includedTools.length > 0) {
      plugins = plugins.filter((plugin) => includedTools.includes(plugin.pluginKey));
    } else {
      plugins = plugins.filter((plugin) => !filteredTools.includes(plugin.pluginKey));
    }

    res.status(200).json(plugins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
    if (!userId) {
      logger.warn('[getAvailableTools] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const appConfig =
      req.config ?? (await getAppConfig({ role: req.user?.role, tenantId: req.user?.tenantId }));

    /** @type {Record<string, FunctionTool> | null} */
    let toolDefinitions = await getCachedTools();

    if (toolDefinitions == null && appConfig?.availableTools != null) {
      logger.warn('[getAvailableTools] Tool cache was empty, re-initializing from app config');
      await setCachedTools(appConfig.availableTools);
      toolDefinitions = appConfig.availableTools;
    }

    /** @type {import('@librechat/api').LCManifestTool[]} */
    const pluginManifest = availableTools;

    /** @type {TPlugin[]} */
    const uniquePlugins = filterUniquePlugins(pluginManifest);
    const authenticatedPlugins = uniquePlugins.map((plugin) =>
      checkPluginAuth(plugin) ? { ...plugin, authenticated: true } : plugin,
    );

    const toolsOutput = [];
    for (const plugin of authenticatedPlugins) {
      const isToolDefined = toolDefinitions?.[plugin.pluginKey] !== undefined;
      const isToolkit =
        plugin.toolkit === true &&
        Object.keys(toolDefinitions ?? {}).some(
          (key) => getToolkitKey({ toolkits, toolName: key }) === plugin.pluginKey,
        );

      if (!isToolDefined && !isToolkit) {
        continue;
      }

      toolsOutput.push(plugin);
    }

    res.status(200).json(filterUniquePlugins(toolsOutput));
  } catch (error) {
    logger.error('[getAvailableTools]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
