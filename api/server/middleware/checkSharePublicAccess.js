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
  [ResourceType.SKILL]: PermissionTypes.SKILLS,
};

const getResourcePerms = async (req, res, action) => {
  const user = req.user;
  if (!user || !user.role) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return null;
  }

  const { resourceType } = req.params;
  const permissionType = resourceToPermissionType[resourceType];

  if (!permissionType) {
    res.status(400).json({
      error: 'Bad Request',
      message: `Unsupported resource type for ${action}: ${resourceType}`,
    });
    return null;
  }

  const role = await getRoleByName(user.role);
  if (!role || !role.permissions) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'No permissions configured for user role',
    });
    return null;
  }

  return {
    user,
    resourceType,
    resourcePerms: role.permissions[permissionType] || {},
  };
};

/**
 * Middleware to check if user has SHARE permission for a resource type.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const checkShareAccess = async (req, res, next) => {
  try {
    const result = await getResourcePerms(req, res, 'sharing');
    if (!result) {
      return;
    }

    const { user, resourceType, resourcePerms } = result;
    const canShare = resourcePerms[Permissions.SHARE] === true;

    if (!canShare) {
      logger.warn(`[checkShareAccess][${user.id}] User denied SHARE for ${resourceType}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: `You do not have permission to share ${resourceType} resources`,
      });
    }

    next();
  } catch (error) {
    logger.error(`[checkShareAccess][${req.user?.id}] Error checking SHARE permission`, error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check sharing permissions',
    });
  }
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

    if (!isPublic) {
      return next();
    }

    const result = await getResourcePerms(req, res, 'public sharing');
    if (!result) {
      return;
    }

    const { user, resourceType, resourcePerms } = result;
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
  checkShareAccess,
  checkSharePublicAccess,
};
