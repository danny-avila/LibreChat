const { getRoleByName } = require('~/models/Role');

/**
 * Middleware to check if a user has one or more required permissions, optionally based on `req.body` properties.
 *
 * @param {PermissionTypes} permissionType - The type of permission to check.
 * @param {Permissions[]} permissions - The list of specific permissions to check.
 * @param {Record<Permissions, string[]>} [bodyProps] - An optional object where keys are permissions and values are arrays of `req.body` properties to check.
 * @returns {Function} Express middleware function.
 */
const generateCheckAccess = (permissionType, permissions, bodyProps = {}) => {
  return async (req, res, next) => {
    try {
      const { user } = req;
      if (!user) {
        return res.status(401).json({ message: 'Authorization required' });
      }

      const role = await getRoleByName(user.role);
      if (role && role[permissionType]) {
        const hasAnyPermission = permissions.some((permission) => {
          if (role[permissionType][permission]) {
            return true;
          }

          if (bodyProps[permission] && req.body) {
            return bodyProps[permission].some((prop) =>
              Object.prototype.hasOwnProperty.call(req.body, prop),
            );
          }

          return false;
        });

        if (hasAnyPermission) {
          return next();
        }
      }

      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    } catch (error) {
      return res.status(500).json({ message: `Server error: ${error.message}` });
    }
  };
};

module.exports = generateCheckAccess;
