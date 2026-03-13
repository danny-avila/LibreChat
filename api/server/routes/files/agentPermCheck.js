const { logger } = require('@librechat/data-schemas');
const { SystemRoles, ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const { getAgent } = require('~/models/Agent');

/**
 * Verifies the requesting user has permission to upload files to an agent's tool_resources.
 * Message attachments (message_file=true) are exempt—they are temporary per-conversation files.
 * Returns an error response object when denied, or `null` when the request is allowed to proceed.
 */
const verifyAgentUploadPermission = async ({ req, res, metadata }) => {
  const isMessageAttachment = metadata.message_file === true || metadata.message_file === 'true';
  if (!metadata.agent_id || !metadata.tool_resource || isMessageAttachment) {
    return null;
  }

  if (req.user.role === SystemRoles.ADMIN) {
    return null;
  }

  const userId = req.user.id;
  const agent = await getAgent({ id: metadata.agent_id });

  if (!agent) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Agent not found',
    });
  }

  if (agent.author.toString() === userId) {
    return null;
  }

  const hasEditPermission = await checkPermission({
    userId,
    role: req.user.role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.EDIT,
  });

  if (hasEditPermission) {
    return null;
  }

  logger.warn(
    `[agentPermCheck] User ${userId} denied upload to agent ${metadata.agent_id} (insufficient permissions)`,
  );
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Insufficient permissions to upload files to this agent',
  });
};

module.exports = { verifyAgentUploadPermission };
