const express = require('express');
const {
  callTool,
  verifyToolAuth,
  getToolCalls,
  getPluginAuthValues,
} = require('~/server/controllers/tools');
const { getAvailableTools } = require('~/server/controllers/PluginController');
const { toolCallLimiter, requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.get('/', getAvailableTools);

/**
 * Get a list of tool calls.
 * @route GET /agents/tools/calls
 * @returns {ToolCallData[]} 200 - application/json
 */
router.get('/calls', getToolCalls);

/**
 * Get plugin auth values for a specific tool
 * @route GET /agents/tools/:pluginKey/auth-values
 * @param {string} pluginKey - The plugin key
 * @returns {{ authValues: Record<string, string> }} 200 - application/json
 */
router.get('/:pluginKey/auth-values', requireJwtAuth, getPluginAuthValues);

/**
 * Verify authentication for a specific tool
 * @route GET /agents/tools/:toolId/auth
 * @param {string} toolId - The ID of the tool to verify
 * @returns {{ authenticated?: boolean; message?: string }}
 */
router.get('/:toolId/auth', verifyToolAuth);

/**
 * Execute code for a specific tool
 * @route POST /agents/tools/:toolId/call
 * @param {string} toolId - The ID of the tool to execute
 * @param {object} req.body - Request body
 * @returns {object} Result of code execution
 */
router.post('/:toolId/call', toolCallLimiter, callTool);

module.exports = router;
