const express = require('express');
const { addTool, updateTool, deleteTool } = require('@librechat/api');
const { callTool, verifyToolAuth, getToolCalls } = require('~/server/controllers/tools');
const { getAvailableTools } = require('~/server/controllers/PluginController');
const { toolCallLimiter } = require('~/server/middleware/limiters');

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

/**
 * Add a new tool/MCP to the system
 * @route POST /agents/tools/add
 * @param {object} req.body - Request body containing tool/MCP data
 * @returns {object} Created tool/MCP object
 */
router.post('/add', addTool);

/**
 * Update an existing tool/MCP in the system
 * @route PUT /agents/tools/:mcp_id
 * @param {string} mcp_id - The ID of the MCP to update
 * @param {object} req.body - Request body containing updated tool/MCP data
 * @returns {object} Updated tool/MCP object
 */
router.put('/:mcp_id', updateTool);

/**
 * Delete a tool/MCP from the system
 * @route DELETE /agents/tools/:mcp_id
 * @param {string} mcp_id - The ID of the MCP to delete
 * @returns {object} Deletion confirmation
 */
router.delete('/:mcp_id', deleteTool);

module.exports = router;
