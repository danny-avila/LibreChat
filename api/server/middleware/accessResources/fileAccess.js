const { logger, runAsSystem } = require('@librechat/data-schemas');
const { PermissionBits, hasPermissions, ResourceType } = require('librechat-data-provider');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const { authorizeSystemGlobalAgent } = require('~/server/services/Agents/systemGlobal');
const { getAgents, getFiles } = require('~/models');

/** Query matching agents that have the given file id in any tool_resource. */
const fileResourceFilter = (fileId) => ({
  $or: [
    { 'tool_resources.execute_code.file_ids': fileId },
    { 'tool_resources.file_search.file_ids': fileId },
    { 'tool_resources.image_edit.file_ids': fileId },
    { 'tool_resources.context.file_ids': fileId },
    { 'tool_resources.ocr.file_ids': fileId },
  ],
});

/**
 * Checks if user has access to a file through agent permissions
 * Files inherit permissions from agents they are attached to.
 */
const checkAgentBasedFileAccess = async ({ userId, role, fileId, fileOwner, tenantId }) => {
  try {
    const fileOwnerId = fileOwner?.toString();
    if (!fileOwnerId) {
      return false;
    }

    const userIdStr = userId.toString();

    /** Tenant-scoped agents that have this file in their tool_resources */
    const agentsWithFile = await getAgents(fileResourceFilter(fileId));
    for (const agent of agentsWithFile ?? []) {
      const agentAuthorId = agent.author?.toString();
      if (!agentAuthorId) {
        continue;
      }

      if (agentAuthorId === userIdStr) {
        logger.debug(`[fileAccess] User is author of agent ${agent.id}`);
        return true;
      }

      try {
        const permissions = await getEffectivePermissions({
          userId,
          role,
          resourceType: ResourceType.AGENT,
          resourceId: agent._id || agent.id,
        });

        if (hasPermissions(permissions, PermissionBits.VIEW)) {
          logger.debug(`[fileAccess] User ${userId} has VIEW permissions on agent ${agent.id}`);
          return true;
        }
      } catch (permissionError) {
        logger.warn(
          `[fileAccess] Permission check failed for agent ${agent.id}:`,
          permissionError.message,
        );
      }
    }

    /* Files attached to a tenantless `tenants: 'system'` global are invisible to the tenant-scoped
     * query above, so a citation/preview/download would 403. Resolve those globals under the system
     * context and authorize VIEW there (principals in the request tenant). */
    const systemGlobalsWithFile = await runAsSystem(async () => {
      const agents = await getAgents({
        isSystem: true,
        tenantId: { $exists: false },
        ...fileResourceFilter(fileId),
      });
      return agents;
    });
    for (const agent of systemGlobalsWithFile ?? []) {
      const result = await authorizeSystemGlobalAgent({
        agentId: agent.id,
        requiredPermission: PermissionBits.VIEW,
        req: { user: { id: userId, role, tenantId } },
      });
      if (result.status === 'ok') {
        logger.debug(`[fileAccess] User ${userId} authorized via system global ${agent.id}`);
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error('[fileAccess] Error checking agent-based access:', error);
    return false;
  }
};

const getTenantId = (value) => value?.toString?.() ?? null;

const denyFileAccess = (res) =>
  res.status(403).json({
    error: 'Forbidden',
    message: 'Insufficient permissions to access this file',
  });

/**
 * Middleware to check if user can access a file
 * Checks: 1) File ownership, 2) Agent-based access through attached agents
 */
const fileAccess = async (req, res, next) => {
  try {
    const fileId = req.params.file_id;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!fileId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'file_id is required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    let [file] = await getFiles({ file_id: fileId });
    if (!file) {
      /* A tenantless file attached to a `tenants: 'system'` global isn't found by the tenant-scoped
       * lookup; retry under the system context pinned to tenantless (never another concrete tenant).
       * Agent-based access below still gates whether this user may actually read it. */
      const systemFiles = await runAsSystem(async () => {
        const rows = await getFiles({ file_id: fileId, tenantId: { $exists: false } });
        return rows;
      });
      file = systemFiles?.[0];
    }
    if (!file) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'File not found',
      });
    }

    const fileTenantId = getTenantId(file.tenantId);
    const userTenantId = getTenantId(req.user?.tenantId);
    // Tenant-scoped files are restricted to their tenant. Legacy files without
    // tenantId remain governed by owner/agent ACLs for non-tenant migrations.
    if (fileTenantId && fileTenantId !== userTenantId) {
      logger.warn(
        `[fileAccess] User ${userId} denied cross-tenant access to file ${fileId} (route ${req.originalUrl})`,
      );
      return denyFileAccess(res);
    }

    if (file.user && file.user.toString() === userId) {
      req.fileAccess = { file };
      return next();
    }

    /** Agent-based access (file inherits agent permissions) */
    const hasAgentAccess = await checkAgentBasedFileAccess({
      userId,
      role: userRole,
      fileId,
      fileOwner: file.user,
      tenantId: userTenantId,
    });
    if (hasAgentAccess) {
      req.fileAccess = { file };
      return next();
    }

    logger.warn(
      `[fileAccess] User ${userId} denied access to file ${fileId} (route ${req.originalUrl})`,
    );
    return denyFileAccess(res);
  } catch (error) {
    logger.error('[fileAccess] Error checking file access:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check file access permissions',
    });
  }
};

module.exports = {
  fileAccess,
};
