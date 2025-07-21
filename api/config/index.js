const { EventSource } = require('eventsource');
const { Time } = require('librechat-data-provider');
const { MCPManager, FlowStateManager } = require('@librechat/api');
const logger = require('./winston');

global.EventSource = EventSource;

/** @type {MCPManager} */
let mcpManager = null;
let flowManager = null;

/**
 * @param {string} [userId] - Optional user ID, to avoid disconnecting the current user.
 * @param {boolean} [skipIdleCheck] - Skip idle connection checking to avoid unnecessary pings.
 * @returns {MCPManager}
 */
function getMCPManager(userId, skipIdleCheck = false) {
  if (!mcpManager) {
    mcpManager = MCPManager.getInstance();
  } else if (!skipIdleCheck) {
    mcpManager.checkIdleConnections(userId);
  }
  return mcpManager;
}

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
  getMCPManager,
  getFlowStateManager,
};
