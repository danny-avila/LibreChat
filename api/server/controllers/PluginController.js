// const { getAvailableToolsService } = require('../services/PluginService');
const fs = require('fs');
const path = require('path');

const getAvailableToolsController = async (req, res) => {
  try {
    fs.readFile(
      path.join(__dirname, '..', '..', 'app', 'langchain', 'tools', 'manifest.json'),
      'utf8',
      (err, data) => {
        if (err) {
          res.status(500).json({ message: err.message });
        } else {
          const jsonData = JSON.parse(data);
          res.status(200).json(jsonData);
        }
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailableToolsController
};
