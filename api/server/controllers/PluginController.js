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
          res.status(200).json(uniquePlugins);
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
