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

/**
 * Sends message data in Server Sent Events format.
 * @param {ServerResponse} res - The server response.
 * @param {{ data: string | Record<string, unknown>, event?: string }} event - The message event.
 * @param {string} event.event - The type of event.
 * @param {string} event.data - The message to be sent.
 */
const sendEvent = (res, event) => {
  if (typeof event.data === 'string' && event.data.length === 0) {
    return;
  }
  res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
};

module.exports = {
  logger,
  sendEvent,
  getMCPManager,
};
