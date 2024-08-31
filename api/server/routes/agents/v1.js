const multer = require('multer');
const express = require('express');
const v1 = require('~/server/controllers/agents/v1');
const actions = require('./actions');

const upload = multer();
const router = express.Router();

/**
 * Agent actions route.
 * @route GET|POST /agents/actions
 */
router.use('/actions', actions);

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.use('/tools', (req, res) => {
  res.json([]);
});

/**
 * Creates an agent.
 * @route POST /agents
 * @param {AgentCreateParams} req.body - The agent creation parameters.
 * @returns {Agent} 201 - Success response - application/json
 */
router.post('/', v1.createAgent);

/**
 * Retrieves an agent.
 * @route GET /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - Success response - application/json
 */
router.get('/:id', v1.getAgent);

/**
 * Updates an agent.
 * @route PATCH /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The agent update parameters.
 * @returns {Agent} 200 - Success response - application/json
 */
router.patch('/:id', v1.updateAgent);

/**
 * Deletes an agent.
 * @route DELETE /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
router.delete('/:id', v1.deleteAgent);

/**
 * Returns a list of agents.
 * @route GET /agents
 * @param {AgentListParams} req.query - The agent list parameters for pagination and sorting.
 * @returns {AgentListResponse} 200 - success response - application/json
 */
router.get('/', v1.getListAgents);

// TODO: handle private agents

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /avatar/:agent_id
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/avatar/:agent_id', upload.single('file'), v1.uploadAgentAvatar);

module.exports = router;
