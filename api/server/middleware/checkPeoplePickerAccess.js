const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models/Role');
const { logger } = require('~/config');

/**
 * Middleware to check if user has permission to access people picker functionality
 * Checks specific permission based on the 'type' query parameter:
 * - type=user: requires VIEW_USERS permission
 * - type=group: requires VIEW_GROUPS permission
 * - no type (mixed search): requires either VIEW_USERS OR VIEW_GROUPS
 */
const checkPeoplePickerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const role = await getRoleByName(user.role);
    if (!role || !role.permissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No permissions configured for user role',
      });
    }

    const { type } = req.query;
    const peoplePickerPerms = role.permissions[PermissionTypes.PEOPLE_PICKER] || {};
    const canViewUsers = peoplePickerPerms[Permissions.VIEW_USERS] === true;
    const canViewGroups = peoplePickerPerms[Permissions.VIEW_GROUPS] === true;

    if (type === 'user') {
      if (!canViewUsers) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to search for users',
        });
      }
    } else if (type === 'group') {
      if (!canViewGroups) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to search for groups',
        });
      }
    } else {
      if (!canViewUsers || !canViewGroups) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to search for both users and groups',
        });
      }
    }
    next();
  } catch (error) {
    logger.error(
      `[checkPeoplePickerAccess][${req.user?.id}] checkPeoplePickerAccess error for req.query.type = ${req.query.type}`,
      error,
    );
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check permissions',
    });
  }
};

module.exports = {
  checkPeoplePickerAccess,
};
