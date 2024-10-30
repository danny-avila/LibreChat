import { useMemo, useCallback } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
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
      if (isAuthenticated && user?.role != null && roles && roles[user.role]) {
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
