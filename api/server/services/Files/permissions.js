const { logger } = require('@librechat/data-schemas');
const { PERMISSION_BITS } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const { getAgent } = require('~/models/Agent');

/**
 * Checks if a user has access to multiple files through a shared agent (batch operation)
 * @param {string} userId - The user ID to check access for
 * @param {string[]} fileIds - Array of file IDs to check
 * @param {string} agentId - The agent ID that might grant access
 * @returns {Promise<Map<string, boolean>>} Map of fileId to access status
 */
const hasAccessToFilesViaAgent = async (userId, fileIds, agentId) => {
  const accessMap = new Map();

  // Initialize all files as no access
  fileIds.forEach((fileId) => accessMap.set(fileId, false));

  try {
    const agent = await getAgent({ id: agentId });

    if (!agent) {
      return accessMap;
    }

    // Check if user is the author - if so, grant access to all files
    if (agent.author.toString() === userId) {
      fileIds.forEach((fileId) => accessMap.set(fileId, true));
      return accessMap;
    }

    // Check if user has at least VIEW permission on the agent
    const hasViewPermission = await checkPermission({
      userId,
      resourceType: 'agent',
      resourceId: agent._id,
      requiredPermission: PERMISSION_BITS.VIEW,
    });

    if (!hasViewPermission) {
      return accessMap;
    }

    // Check if user has EDIT permission (which would indicate collaborative access)
    const hasEditPermission = await checkPermission({
      userId,
      resourceType: 'agent',
      resourceId: agent._id,
      requiredPermission: PERMISSION_BITS.EDIT,
    });

    // If user only has VIEW permission, they can't access files
    // Only users with EDIT permission or higher can access agent files
    if (!hasEditPermission) {
      return accessMap;
    }

    // User has edit permissions - check which files are actually attached
    const attachedFileIds = new Set();
    if (agent.tool_resources) {
      for (const [_resourceType, resource] of Object.entries(agent.tool_resources)) {
        if (resource?.file_ids && Array.isArray(resource.file_ids)) {
          resource.file_ids.forEach((fileId) => attachedFileIds.add(fileId));
        }
      }
    }

    // Grant access only to files that are attached to this agent
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
 * @param {Array<MongoFile>} files - Array of file documents
 * @param {string} userId - User ID for access control
 * @param {string} agentId - Agent ID that might grant access to files
 * @returns {Promise<Array<MongoFile>>} Filtered array of accessible files
 */
const filterFilesByAgentAccess = async (files, userId, agentId) => {
  if (!userId || !agentId || !files || files.length === 0) {
    return files;
  }

  // Separate owned files from files that need access check
  const filesToCheck = [];
  const ownedFiles = [];

  for (const file of files) {
    if (file.user && file.user.toString() === userId) {
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
  const accessMap = await hasAccessToFilesViaAgent(userId, fileIds, agentId);

  // Filter files based on access
  const accessibleFiles = filesToCheck.filter((file) => accessMap.get(file.file_id));

  return [...ownedFiles, ...accessibleFiles];
};

module.exports = {
  hasAccessToFilesViaAgent,
  filterFilesByAgentAccess,
};
