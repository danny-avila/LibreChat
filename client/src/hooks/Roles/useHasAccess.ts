import { useMemo, useCallback, useContext } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { AuthContext } from '~/hooks/AuthContext';

const useHasAccess = ({
  permissionType,
  permission,
}: {
  permissionType: PermissionTypes;
  permission: Permissions;
}) => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  const roles = authContext?.roles;
  const isAuthenticated = authContext?.isAuthenticated || false;

  const checkAccess = useCallback(
    ({ user, permissionType, permission }) => {
      if (!authContext) {
        return false;
      }

      if (isAuthenticated && user?.role != null && roles && roles[user.role]) {
        return roles[user.role]?.[permissionType]?.[permission] === true;
      }
      return false;
    },
    [authContext, isAuthenticated, roles],
  );

  const hasAccess = useMemo(
    () => checkAccess({ user, permissionType, permission }),
    [user, permissionType, permission, checkAccess],
  );

  return hasAccess;
};

export default useHasAccess;
