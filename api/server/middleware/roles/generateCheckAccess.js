const { getRoleByName } = require('~/models/Role');
const { logger } = require('~/config');

/**
 * Core function to check if a user has one or more required permissions
 *
 * @param {object} user - The user object
 * @param {PermissionTypes} permissionType - The type of permission to check
 * @param {Permissions[]} permissions - The list of specific permissions to check
 * @param {Record<Permissions, string[]>} [bodyProps] - An optional object where keys are permissions and values are arrays of properties to check
 * @param {object} [checkObject] - The object to check properties against
 * @returns {Promise<boolean>} Whether the user has the required permissions
 */
const checkAccess = async (user, permissionType, permissions, bodyProps = {}, checkObject = {}) => {
  if (!user) {
    return false;
  }

  const role = await getRoleByName(user.role);
  if (role && role.permissions && role.permissions[permissionType]) {
    const hasAnyPermission = permissions.some((permission) => {
      if (role.permissions[permissionType][permission]) {
        return true;
      }

      if (bodyProps[permission] && checkObject) {
        return bodyProps[permission].some((prop) =>
          Object.prototype.hasOwnProperty.call(checkObject, prop),
        );
      }

      return false;
    });

    return hasAnyPermission;
  }

  return false;
};

/**
 * Middleware to check if a user has one or more required permissions, optionally based on `req.body` properties.
 *
 * @param {PermissionTypes} permissionType - The type of permission to check.
 * @param {Permissions[]} permissions - The list of specific permissions to check.
 * @param {Record<Permissions, string[]>} [bodyProps] - An optional object where keys are permissions and values are arrays of `req.body` properties to check.
 * @returns {(req: ServerRequest, res: ServerResponse, next: NextFunction) => Promise<void>} Express middleware function.
 */
const generateCheckAccess = (permissionType, permissions, bodyProps = {}) => {
  return async (req, res, next) => {
    try {
      const hasAccess = await checkAccess(
        req.user,
        permissionType,
        permissions,
        bodyProps,
        req.body,
      );

      if (hasAccess) {
        return next();
      }

      logger.warn(
        `[${permissionType}] Forbidden: Insufficient permissions for User ${req.user.id}: ${permissions.join(', ')}`,
      );
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: `Server error: ${error.message}` });
    }
  };
};

module.exports = {
  checkAccess,
  generateCheckAccess,
};
