const { logger, ResourceCapabilityMap } = require('@librechat/data-schemas');
const { ResourceType, PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models');
const { hasCapability } = require('~/server/middleware/roles/capabilities');

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

const getShareContext = (req, res, action) => {
  const user = req.user;
  if (!user || !user.role) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  const { resourceType } = req.params;
  const permissionType = resourceToPermissionType[resourceType];

  if (!permissionType) {
    res.status(400).json({
      error: 'Bad Request',
      message: `Unsupported resource type for ${action}: ${resourceType}`,
    });
    return;
  }

  return {
    user,
    resourceType,
    permissionType,
  };
};

const getResourcePerms = async (req, res, action, context) => {
  const resolvedContext = context || getShareContext(req, res, action);
  if (!resolvedContext) {
    return null;
  }

  const { user, resourceType, permissionType } = resolvedContext;
  const cacheKey = `${user.role}:${resourceType}`;
  const cached = req.sharePermissionContext;
  if (cached?.cacheKey === cacheKey) {
    return {
      user,
      resourceType,
      resourcePerms: cached.resourcePerms,
    };
  }

  const role = await getRoleByName(user.role);
  if (!role || !role.permissions) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'No permissions configured for user role',
    });
    return null;
  }

  const resourcePerms = role.permissions[permissionType] || {};
  req.sharePermissionContext = {
    cacheKey,
    resourcePerms,
  };

  return {
    user,
    resourceType,
    resourcePerms,
  };
};

const hasResourceManagementCapability = async (user, resourceType) => {
  const capability = ResourceCapabilityMap[resourceType];
  if (!capability) {
    return false;
  }

  try {
    return await hasCapability(user, capability);
  } catch (error) {
    logger.warn(`[checkShareAccess] capability check failed, denying bypass: ${error.message}`);
    return false;
  }
};

/**
 * Middleware to check if user has SHARE permission for a resource type.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const checkShareAccess = async (req, res, next) => {
  try {
    const context = getShareContext(req, res, 'sharing');
    if (!context) {
      return;
    }

    if (await hasResourceManagementCapability(context.user, context.resourceType)) {
      return next();
    }

    const result = await getResourcePerms(req, res, 'sharing', context);
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
