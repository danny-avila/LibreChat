const { logger } = require('@librechat/data-schemas');
const { ResourceType, PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models');

/**
 * Maps resource types to their corresponding permission types
 */
const resourceToPermissionType = {
  [ResourceType.AGENT]: PermissionTypes.AGENTS,
  [ResourceType.PROMPTGROUP]: PermissionTypes.PROMPTS,
  [ResourceType.MCPSERVER]: PermissionTypes.MCP_SERVERS,
  [ResourceType.REMOTE_AGENT]: PermissionTypes.REMOTE_AGENTS,
};

/**
 * Middleware to check if user has SHARE_PUBLIC permission for a resource type
 * Only enforced when request body contains `public: true`
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const checkSharePublicAccess = async (req, res, next) => {
  try {
    const { public: isPublic } = req.body;

    // Only check if trying to enable public sharing
    if (!isPublic) {
      return next();
    }

    const user = req.user;
    if (!user || !user.role) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { resourceType } = req.params;
    const permissionType = resourceToPermissionType[resourceType];

    if (!permissionType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Unsupported resource type for public sharing: ${resourceType}`,
      });
    }

    const role = await getRoleByName(user.role);
    if (!role || !role.permissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No permissions configured for user role',
      });
    }

    const resourcePerms = role.permissions[permissionType] || {};
    const canSharePublic = resourcePerms[Permissions.SHARE_PUBLIC] === true;

    if (!canSharePublic) {
      logger.warn(
        `[checkSharePublicAccess][${user.id}] User denied SHARE_PUBLIC for ${resourceType}`,
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: `You do not have permission to share ${resourceType} resources publicly`,
      });
    }

    next();
  } catch (error) {
    logger.error(
      `[checkSharePublicAccess][${req.user?.id}] Error checking SHARE_PUBLIC permission`,
      error,
    );
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check public sharing permissions',
    });
  }
};

module.exports = {
  checkSharePublicAccess,
};
