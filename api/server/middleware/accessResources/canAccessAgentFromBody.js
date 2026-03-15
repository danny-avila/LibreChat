const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  Permissions,
  ResourceType,
  SystemRoles,
  PermissionTypes,
  isAgentsEndpoint,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { getRoleByName } = require('~/models/Role');
const { getAgent } = require('~/models/Agent');

/**
 * Resolves custom agent ID (e.g., "agent_abc123") to MongoDB ObjectId.
 * @param {string} agentCustomId - Custom agent ID from request body
 * @returns {Promise<Object|null>} Agent document with _id field, or null if not found
 */
const resolveAgentIdFromBody = async (agentCustomId) => {
  if (isEphemeralAgentId(agentCustomId)) {
    return null;
  }

  return await getAgent({ id: agentCustomId });
};

/**
 * Creates a canAccessResource middleware call for the given agent ID
 * and chains to the provided continuation on success.
 */
const checkAgentResourceAccess = (agentId, requiredPermission, req, res, continuation) => {
  const middleware = canAccessResource({
    resourceType: ResourceType.AGENT,
    requiredPermission,
    resourceIdParam: 'agent_id',
    idResolver: () => resolveAgentIdFromBody(agentId),
  });

  const tempReq = {
    ...req,
    params: {
      ...req.params,
      agent_id: agentId,
    },
  };

  return middleware(tempReq, res, continuation);
};

/**
 * Validates that the user has MULTI_CONVO:USE permission and, when addedConvo.agent_id
 * is a real (non-ephemeral) agent, VIEW access to that agent resource.
 */
const checkAddedConvoAccess = async (req, res, next, requiredPermission) => {
  const addedConvo = req.body?.addedConvo;
  if (!addedConvo) {
    return next();
  }

  try {
    if (!req.user?.role) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions for multi-conversation',
      });
    }

    if (req.user.role !== SystemRoles.ADMIN) {
      const role = await getRoleByName(req.user.role);
      const hasMultiConvo = role?.permissions?.[PermissionTypes.MULTI_CONVO]?.[Permissions.USE];
      if (!hasMultiConvo) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Multi-conversation feature is not enabled',
        });
      }
    }

    const addedAgentId = addedConvo.agent_id;
    if (!addedAgentId || isEphemeralAgentId(addedAgentId)) {
      return next();
    }

    return checkAgentResourceAccess(addedAgentId, requiredPermission, req, res, next);
  } catch (error) {
    logger.error('Failed to validate addedConvo access permissions', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate addedConvo access permissions',
    });
  }
};

/**
 * Middleware factory that checks agent access permissions from request body.
 * Validates both the primary agent_id and, when present, addedConvo.agent_id
 * (which also requires MULTI_CONVO:USE permission).
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @returns {Function} Express middleware function
 */
const canAccessAgentFromBody = (options) => {
  const { requiredPermission } = options;

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

      const afterPrimaryCheck = () => checkAddedConvoAccess(req, res, next, requiredPermission);

      if (isEphemeralAgentId(agentId)) {
        return afterPrimaryCheck();
      }

      return checkAgentResourceAccess(agentId, requiredPermission, req, res, afterPrimaryCheck);
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
