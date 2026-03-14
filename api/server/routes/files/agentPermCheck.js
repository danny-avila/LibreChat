const { checkAgentUploadAuth } = require('@librechat/api');
const { checkPermission } = require('~/server/services/PermissionService');
const { getAgent } = require('~/models/Agent');

/** @returns {Promise<boolean>} true if denied (response already sent), false if allowed */
const verifyAgentUploadPermission = async ({ req, res, metadata }) => {
  const result = await checkAgentUploadAuth(
    {
      userId: req.user.id,
      userRole: req.user.role,
      agentId: metadata.agent_id,
      toolResource: metadata.tool_resource,
      messageFile: metadata.message_file,
    },
    { getAgent, checkPermission },
  );

  if (!result.allowed) {
    res.status(result.status).json({ error: result.error, message: result.message });
    return true;
  }
  return false;
};

module.exports = { verifyAgentUploadPermission };
