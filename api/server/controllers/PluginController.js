const path = require('path');
const { promises: fs } = require('fs');
const { CacheKeys } = require('librechat-data-provider');
const { addOpenAPISpecs } = require('~/app/clients/tools/util/addOpenAPISpecs');
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
const isPluginAuthenticated = (plugin) => {
  if (!plugin.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const authFieldOptions = authFieldObj.authField.split('||');
    let isFieldAuthenticated = false;

    for (const fieldOption of authFieldOptions) {
      const envValue = process.env[fieldOption];
      if (envValue && envValue.trim() !== '' && envValue !== 'user_provided') {
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

    const manifestFile = await fs.readFile(
      path.join(__dirname, '..', '..', 'app', 'clients', 'tools', 'manifest.json'),
      'utf8',
    );

    const jsonData = JSON.parse(manifestFile);
    const uniquePlugins = filterUniquePlugins(jsonData);
    const authenticatedPlugins = uniquePlugins.map((plugin) => {
      if (isPluginAuthenticated(plugin)) {
        return { ...plugin, authenticated: true };
      } else {
        return plugin;
      }
    });
    const plugins = await addOpenAPISpecs(authenticatedPlugins);
    await cache.set(CacheKeys.PLUGINS, plugins);
    res.status(200).json(plugins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailablePluginsController,
};
