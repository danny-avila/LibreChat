// const { getAvailableToolsService } = require('../services/PluginService');
const fs = require('fs');
const path = require('path');

const filterUniquePlugins = (plugins) => {
  const seen = new Set();
  return plugins.filter((plugin) => {
    const duplicate = seen.has(plugin.pluginKey);
    seen.add(plugin.pluginKey);
    return !duplicate;
  });
};

const isPluginAuthenticated = (plugin) => {
  if (!plugin.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const envValue = process.env[authFieldObj.authField];
    return envValue && envValue.trim() !== '';
  });
};

const getAvailablePluginsController = async (req, res) => {
  try {
    fs.readFile(
      path.join(__dirname, '..', '..', 'app', 'langchain', 'tools', 'manifest.json'),
      'utf8',
      (err, data) => {
        if (err) {
          res.status(500).json({ message: err.message });
        } else {
          const jsonData = JSON.parse(data);
          const uniquePlugins = filterUniquePlugins(jsonData);
          const authenticatedPlugins = uniquePlugins.map((plugin) => {
            if (isPluginAuthenticated(plugin)) {
              return { ...plugin, authenticated: true };
            } else {
              return plugin;
            }
          });
          res.status(200).json(authenticatedPlugins);
        }
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailablePluginsController
};
