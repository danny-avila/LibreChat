const { EventSource } = require('eventsource');
const logger = require('./winston');

global.EventSource = EventSource;

let mcpManager = null;

/**
 * @returns {Promise<MCPManager>}
 */
async function getMCPManager() {
  if (!mcpManager) {
    const { MCPManager } = await import('librechat-mcp');
    mcpManager = MCPManager.getInstance(logger);
  }
  return mcpManager;
}

module.exports = {
  logger,
  getMCPManager,
};
