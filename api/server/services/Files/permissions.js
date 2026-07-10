const { logger, getTenantId, runAsSystem } = require('@librechat/data-schemas');
const { PermissionBits, ResourceType, isEphemeralAgentId } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  withSystemGlobalFallback,
  authorizeSystemGlobalAgent,
} = require('~/server/services/Agents/systemGlobal');
const { getAgent, getFiles } = require('~/models');

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

function getFilesById(files) {
  const filesById = new Map();
  for (const file of files ?? []) {
    if (file?.file_id) {
      filesById.set(file.file_id, file);
    }
  }
  return filesById;
}

/**
 * Checks if a user has access to multiple files through a shared agent (batch operation).
 * Access is scoped to files attached to the agent with valid file metadata.
 * @param {Object} params - Parameters object
 * @param {string} params.userId - The user ID to check access for
 * @param {string} [params.role] - Optional user role to avoid DB query
 * @param {string[]} params.fileIds - Array of file IDs to check
 * @param {string} params.agentId - The agent ID that might grant access
 * @param {boolean} [params.isDelete] - Whether the operation is a delete operation
 * @param {Array<{ file_id: string, user: string }>} [params.files] - Pre-fetched file documents
 * @returns {Promise<Map<string, boolean>>} Map of fileId to access status
 */
const hasAccessToFilesViaAgent = async ({ userId, role, fileIds, agentId, isDelete, files }) => {
  const accessMap = new Map();

  fileIds.forEach((fileId) => accessMap.set(fileId, false));

  try {
    const agent = await withSystemGlobalFallback(
      agentId,
      () => getAgent({ id: agentId }),
      () => getAgent({ id: agentId, tenantId: { $exists: false } }),
    );

    if (!agent) {
      return accessMap;
    }

    /* A tenantless `tenants: 'system'` global's ACL grants are invisible to a tenant-scoped check;
     * authorize it under the system context so its admin-provided context/OCR files aren't filtered
     * out at runtime. In-tenant agents (incl. explicit-tenant globals) keep the normal check. */
    const viaSystemGlobal = agent.isSystem === true && agent.tenantId == null;
    const hasAgentPermission = (requiredPermission) =>
      viaSystemGlobal
        ? authorizeSystemGlobalAgent({
            agentId,
            requiredPermission,
            req: { user: { id: userId, role, tenantId: getTenantId() } },
          }).then((result) => result.status === 'ok')
        : checkPermission({
            userId,
            role,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            requiredPermission,
          });

    const attachedFileIds = getAttachedFileIds(agent);
    const agentAuthorId = agent.author?.toString();
    /* A tenantless system global's admin-provided files are invisible to the caller's tenant-scoped
     * `files`/getFiles lookup, so load their metadata under the system context (the ids are already
     * scoped to this authorized agent's tool_resources). */
    let fileMetadata;
    if (viaSystemGlobal) {
      fileMetadata = await runAsSystem(async () => {
        const systemFiles = await getFiles({ file_id: { $in: fileIds } }, null, {
          file_id: 1,
          user: 1,
        });
        return systemFiles;
      });
    } else if (files != null) {
      fileMetadata = files;
    } else {
      fileMetadata = await getFiles({ file_id: { $in: fileIds } }, null, { file_id: 1, user: 1 });
    }
    const filesById = getFilesById(fileMetadata);
    const canInheritFromAgent = (fileId) =>
      attachedFileIds.has(fileId) && filesById.get(fileId)?.user != null;

    if (agentAuthorId === userId.toString()) {
      fileIds.forEach((fileId) => {
        if (canInheritFromAgent(fileId)) {
          accessMap.set(fileId, true);
        }
      });
      return accessMap;
    }

    const hasViewPermission = await hasAgentPermission(PermissionBits.VIEW);

    if (!hasViewPermission) {
      return accessMap;
    }

    if (isDelete) {
      const hasEditPermission = await hasAgentPermission(PermissionBits.EDIT);

      if (!hasEditPermission) {
        return accessMap;
      }
    }

    fileIds.forEach((fileId) => {
      if (canInheritFromAgent(fileId)) {
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
  const accessMap = await hasAccessToFilesViaAgent({
    userId,
    role,
    fileIds,
    agentId,
    files: filesToCheck,
  });

  // Filter files based on access
  const accessibleFiles = filesToCheck.filter((file) => accessMap.get(file.file_id));

  return [...ownedFiles, ...accessibleFiles];
};

module.exports = {
  hasAccessToFilesViaAgent,
  filterFilesByAgentAccess,
};
