import { useMemo, useCallback } from 'react';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

const useHasAccess = ({
  permissionType,
  permission,
}: {
  permissionType: PermissionTypes;
  permission: Permissions;
}) => {
  const { isAuthenticated, user, roles } = useAuthContext();

  const checkAccess = useCallback(
    ({ user, permissionType, permission }) => {
      if (isAuthenticated && user?.role === SystemRoles.ADMIN) {
        return true;
      } else if (isAuthenticated && user?.role != null && roles && roles[user.role]) {
        return roles[user.role]?.[permissionType]?.[permission] === true;
      }
      return false;
    },
    [isAuthenticated, roles],
  );

  const hasAccess = useMemo(
    () => checkAccess({ user, permissionType, permission }),
    [user, permissionType, permission, checkAccess],
  );

  return hasAccess;
};

export default useHasAccess;
