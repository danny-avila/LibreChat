const { EventSource } = require('eventsource');
const { Time, CacheKeys } = require('librechat-data-provider');
const logger = require('./winston');

global.EventSource = EventSource;

let mcpManager = null;
let flowManager = null;

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
 * @param {(key: string) => Keyv} getLogStores
 * @returns {Promise<FlowStateManager>}
 */
async function getFlowStateManager(getLogStores) {
  if (!flowManager) {
    const { FlowStateManager } = await import('librechat-mcp');
    flowManager = new FlowStateManager(getLogStores(CacheKeys.FLOWS), {
      ttl: Time.ONE_MINUTE * 3,
      logger,
    });
  }
  return flowManager;
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
  getFlowStateManager,
};
