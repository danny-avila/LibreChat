const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

function loadMcpServers() {
  const configPath = path.resolve(__dirname, '../librechat.yaml');
  try {
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    return config.mcpServers || {};
  } catch (err) {
    console.error('Failed to load librechat.yaml:', err);
    return {};
  }
}

module.exports = loadMcpServers;