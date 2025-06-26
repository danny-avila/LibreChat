import { logger } from '@librechat/data-schemas';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { NextFunction, Request as ServerRequest, Response as ServerResponse } from 'express';
import type { IRole, IUser } from '@librechat/data-schemas';

/**
 * Core function to check if a user has one or more required permissions
 * @param user - The user object
 * @param permissionType - The type of permission to check
 * @param permissions - The list of specific permissions to check
 * @param bodyProps - An optional object where keys are permissions and values are arrays of properties to check
 * @param checkObject - The object to check properties against
 * @returns Whether the user has the required permissions
 */
export const checkAccess = async ({
  user,
  permissionType,
  permissions,
  getRoleByName,
  bodyProps = {} as Record<Permissions, string[]>,
  checkObject = {},
}: {
  user: IUser;
  permissionType: PermissionTypes;
  permissions: Permissions[];
  bodyProps?: Record<Permissions, string[]>;
  checkObject?: object;
  getRoleByName: (roleName: string, fieldsToSelect?: string | string[]) => Promise<IRole | null>;
}): Promise<boolean> => {
  if (!user || !user.role) {
    return false;
  }

  const role = await getRoleByName(user.role);
  if (role && role.permissions && role.permissions[permissionType]) {
    const hasAnyPermission = permissions.some((permission) => {
      if (
        role.permissions?.[permissionType as keyof typeof role.permissions]?.[
          permission as keyof (typeof role.permissions)[typeof permissionType]
        ]
      ) {
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
 * @param permissionType - The type of permission to check.
 * @param permissions - The list of specific permissions to check.
 * @param bodyProps - An optional object where keys are permissions and values are arrays of `req.body` properties to check.
 * @param getRoleByName - A function to get the role by name.
 * @returns Express middleware function.
 */
export const generateCheckAccess = ({
  permissionType,
  permissions,
  bodyProps = {} as Record<Permissions, string[]>,
  getRoleByName,
}: {
  permissionType: PermissionTypes;
  permissions: Permissions[];
  bodyProps?: Record<Permissions, string[]>;
  getRoleByName: (roleName: string, fieldsToSelect?: string | string[]) => Promise<IRole | null>;
}): ((req: ServerRequest, res: ServerResponse, next: NextFunction) => Promise<unknown>) => {
  return async (req, res, next) => {
    try {
      const hasAccess = await checkAccess({
        user: req.user as IUser,
        permissionType,
        permissions,
        bodyProps,
        checkObject: req.body,
        getRoleByName,
      });

      if (hasAccess) {
        return next();
      }

      logger.warn(
        `[${permissionType}] Forbidden: Insufficient permissions for User ${req.user?.id}: ${permissions.join(', ')}`,
      );
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };
};
