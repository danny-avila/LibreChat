const { logger } = require('@librechat/data-schemas');
const { Constants, isAgentsEndpoint, ResourceType } = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { getAgent } = require('~/models/Agent');

/**
 * Agent ID resolver function for agent_id from request body
 * Resolves custom agent ID (e.g., "agent_abc123") to MongoDB ObjectId
 * This is used specifically for chat routes where agent_id comes from request body
 *
 * @param {string} agentCustomId - Custom agent ID from request body
 * @returns {Promise<Object|null>} Agent document with _id field, or null if not found
 */
const resolveAgentIdFromBody = async (agentCustomId) => {
  // Handle ephemeral agents - they don't need permission checks
  if (agentCustomId === Constants.EPHEMERAL_AGENT_ID) {
    return null; // No permission check needed for ephemeral agents
  }

  return await getAgent({ id: agentCustomId });
};

/**
 * Middleware factory that creates middleware to check agent access permissions from request body.
 * This middleware is specifically designed for chat routes where the agent_id comes from req.body
 * instead of route parameters.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @returns {Function} Express middleware function
 *
 * @example
 * // Basic usage for agent chat (requires VIEW permission)
 * router.post('/chat',
 *   canAccessAgentFromBody({ requiredPermission: PermissionBits.VIEW }),
 *   buildEndpointOption,
 *   chatController
 * );
 */
const canAccessAgentFromBody = (options) => {
  const { requiredPermission } = options;

  // Validate required options
  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error('canAccessAgentFromBody: requiredPermission is required and must be a number');
  }

  return async (req, res, next) => {
    try {
      const { endpoint, agent_id } = req.body;
      let agentId = agent_id;

      if (!isAgentsEndpoint(endpoint)) {
        agentId = Constants.EPHEMERAL_AGENT_ID;
      }

      if (!agentId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'agent_id is required in request body',
        });
      }

      // Skip permission checks for ephemeral agents
      if (agentId === Constants.EPHEMERAL_AGENT_ID) {
        return next();
      }

      const agentAccessMiddleware = canAccessResource({
        resourceType: ResourceType.AGENT,
        requiredPermission,
        resourceIdParam: 'agent_id', // This will be ignored since we use custom resolver
        idResolver: () => resolveAgentIdFromBody(agentId),
      });

      const tempReq = {
        ...req,
        params: {
          ...req.params,
          agent_id: agentId,
        },
      };

      return agentAccessMiddleware(tempReq, res, next);
    } catch (error) {
      logger.error('Failed to validate agent access permissions', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to validate agent access permissions',
      });
    }
  };
};

module.exports = {
  canAccessAgentFromBody,
};
