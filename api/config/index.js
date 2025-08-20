const { MCPManager, FlowStateManager } = require('@librechat/api');
const { EventSource } = require('eventsource');
const { Time } = require('librechat-data-provider');
const logger = require('./winston');

global.EventSource = EventSource;

/** @type {MCPManager} */
let flowManager = null;

/**
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_MINUTE * 3,
    });
  }
  return flowManager;
}

module.exports = {
  logger,
  createMCPManager: MCPManager.createInstance,
  getMCPManager: MCPManager.getInstance,
  getFlowStateManager,
};
