const express = require('express');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { requireJwtAuth, generateCheckAccess } = require('~/server/middleware');
const v1 = require('~/server/controllers/agents/v1');
const actions = require('./actions');
const tools = require('./tools');

const router = express.Router();
const avatar = express.Router();

const checkAgentAccess = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
const checkAgentCreate = generateCheckAccess(PermissionTypes.AGENTS, [
  Permissions.USE,
  Permissions.CREATE,
]);

const checkGlobalAgentShare = generateCheckAccess(
  PermissionTypes.AGENTS,
  [Permissions.USE, Permissions.CREATE],
  {
    [Permissions.SHARED_GLOBAL]: ['projectIds', 'removeProjectIds'],
  },
);

router.use(requireJwtAuth);
router.use(checkAgentAccess);

/**
 * Agent actions route.
 * @route GET|POST /agents/actions
 */
router.use('/actions', actions);

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 */
router.use('/tools', tools);

/**
 * Creates an agent.
 * @route POST /agents
 * @param {AgentCreateParams} req.body - The agent creation parameters.
 * @returns {Agent} 201 - Success response - application/json
 */
router.post('/', checkAgentCreate, v1.createAgent);

/**
 * Retrieves an agent.
 * @route GET /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - Success response - application/json
 */
router.get('/:id', checkAgentAccess, v1.getAgent);

/**
 * Updates an agent.
 * @route PATCH /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The agent update parameters.
 * @returns {Agent} 200 - Success response - application/json
 */
router.patch('/:id', checkGlobalAgentShare, v1.updateAgent);

/**
 * Duplicates an agent.
 * @route POST /agents/:id/duplicate
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 201 - Success response - application/json
 */
router.post('/:id/duplicate', checkAgentCreate, v1.duplicateAgent);

/**
 * Deletes an agent.
 * @route DELETE /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
router.delete('/:id', checkAgentCreate, v1.deleteAgent);

/**
 * Returns a list of agents.
 * @route GET /agents
 * @param {AgentListParams} req.query - The agent list parameters for pagination and sorting.
 * @returns {AgentListResponse} 200 - success response - application/json
 */
router.get('/', checkAgentAccess, v1.getListAgents);

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /agents/:agent_id/avatar
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
avatar.post('/:agent_id/avatar/', checkAgentAccess, v1.uploadAgentAvatar);

module.exports = { v1: router, avatar };
