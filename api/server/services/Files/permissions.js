const { logger } = require('@librechat/data-schemas');
const { PermissionBits, ResourceType, isEphemeralAgentId } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const { getAgent } = require('~/models');

/**
 * @param {Object} agent - The agent document (lean)
 * @returns {Set<string>} All file IDs attached across all resource types
 */
function getAttachedFileIds(agent) {
  const attachedFileIds = new Set();
  if (agent.tool_resources) {
    for (const resource of Object.values(agent.tool_resources)) {
      if (resource?.file_ids && Array.isArray(resource.file_ids)) {
        for (const fileId of resource.file_ids) {
          attachedFileIds.add(fileId);
        }
      }
    }
  }
  return attachedFileIds;
}

/**
 * Checks if a user has access to multiple files through a shared agent (batch operation).
 * Access is always scoped to files actually attached to the agent's tool_resources.
 * @param {Object} params - Parameters object
 * @param {string} params.userId - The user ID to check access for
 * @param {string} [params.role] - Optional user role to avoid DB query
 * @param {string[]} params.fileIds - Array of file IDs to check
 * @param {string} params.agentId - The agent ID that might grant access
 * @param {boolean} [params.isDelete] - Whether the operation is a delete operation
 * @returns {Promise<Map<string, boolean>>} Map of fileId to access status
 */
const hasAccessToFilesViaAgent = async ({ userId, role, fileIds, agentId, isDelete }) => {
  const accessMap = new Map();

  fileIds.forEach((fileId) => accessMap.set(fileId, false));

  try {
    const agent = await getAgent({ id: agentId });

    if (!agent) {
      return accessMap;
    }

    const attachedFileIds = getAttachedFileIds(agent);

    if (agent.author.toString() === userId.toString()) {
      fileIds.forEach((fileId) => {
        if (attachedFileIds.has(fileId)) {
          accessMap.set(fileId, true);
        }
      });
      return accessMap;
    }

    const hasViewPermission = await checkPermission({
      userId,
      role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });

    if (!hasViewPermission) {
      return accessMap;
    }

    if (isDelete) {
      const hasEditPermission = await checkPermission({
        userId,
        role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.EDIT,
      });

      if (!hasEditPermission) {
        return accessMap;
      }
    }

    fileIds.forEach((fileId) => {
      if (attachedFileIds.has(fileId)) {
        accessMap.set(fileId, true);
      }
    });

    return accessMap;
  } catch (error) {
    logger.error('[hasAccessToFilesViaAgent] Error checking file access:', error);
    return accessMap;
  }
};

/**
 * Filter files based on user access through agents
 * @param {Object} params - Parameters object
 * @param {Array<MongoFile>} params.files - Array of file documents
 * @param {string} params.userId - User ID for access control
 * @param {string} [params.role] - Optional user role to avoid DB query
 * @param {string} params.agentId - Agent ID that might grant access to files
 * @returns {Promise<Array<MongoFile>>} Filtered array of accessible files
 */
const filterFilesByAgentAccess = async ({ files, userId, role, agentId }) => {
  if (!userId || !agentId || !files || files.length === 0 || isEphemeralAgentId(agentId)) {
    return files;
  }

  // Separate owned files from files that need access check
  const filesToCheck = [];
  const ownedFiles = [];

  for (const file of files) {
    if (file.user && file.user.toString() === userId.toString()) {
      ownedFiles.push(file);
    } else {
      filesToCheck.push(file);
    }
  }

  if (filesToCheck.length === 0) {
    return ownedFiles;
  }

  // Batch check access for all non-owned files
  const fileIds = filesToCheck.map((f) => f.file_id);
  const accessMap = await hasAccessToFilesViaAgent({ userId, role, fileIds, agentId });

  // Filter files based on access
  const accessibleFiles = filesToCheck.filter((file) => accessMap.get(file.file_id));

  return [...ownedFiles, ...accessibleFiles];
};

module.exports = {
  hasAccessToFilesViaAgent,
  filterFilesByAgentAccess,
};
