const { getAgent } = require('~/models/Agent');
const { canAccessResource } = require('./canAccessResource');

/**
 * Agent ID resolver function
 * Resolves custom agent ID (e.g., "agent_abc123") to MongoDB ObjectId
 *
 * @param {string} agentCustomId - Custom agent ID from route parameter
 * @returns {Promise<Object|null>} Agent document with _id field, or null if not found
 */
const resolveAgentId = async (agentCustomId) => {
  return await getAgent({ id: agentCustomId });
};

/**
 * Agent-specific middleware factory that creates middleware to check agent access permissions.
 * This middleware extends the generic canAccessResource to handle agent custom ID resolution.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @param {string} [options.resourceIdParam='id'] - The name of the route parameter containing the agent custom ID
 * @returns {Function} Express middleware function
 *
 * @example
 * // Basic usage for viewing agents
 * router.get('/agents/:id',
 *   canAccessAgentResource({ requiredPermission: 1 }),
 *   getAgent
 * );
 *
 * @example
 * // Custom resource ID parameter and edit permission
 * router.patch('/agents/:agent_id',
 *   canAccessAgentResource({
 *     requiredPermission: 2,
 *     resourceIdParam: 'agent_id'
 *   }),
 *   updateAgent
 * );
 */
const canAccessAgentResource = (options) => {
  const { requiredPermission, resourceIdParam = 'id' } = options;

  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error('canAccessAgentResource: requiredPermission is required and must be a number');
  }

  return canAccessResource({
    resourceType: 'agent',
    requiredPermission,
    resourceIdParam,
    idResolver: resolveAgentId,
  });
};

module.exports = {
  canAccessAgentResource,
};
