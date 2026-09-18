import { useContext } from 'react';
import { useRecoilValue } from 'recoil';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { AuthContext } from '~/hooks/AuthContext';
import { useShareContext } from '~/Providers';
import { StudioContext } from './context';
import { useHasAccess } from '~/hooks';
import store from '~/store';

export function StudioProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const { shareId } = useShareContext();
  const { data: startup } = useGetStartupConfig();
  const permitted = useHasAccess({
    permissionType: PermissionTypes.MEDIA,
    permission: Permissions.USE,
  });
  const temporary = useRecoilValue(store.isTemporary);
  const available =
    !!auth?.isAuthenticated && permitted && !!startup?.media?.studio && !shareId && !temporary;
  return <StudioContext.Provider value={available}>{children}</StudioContext.Provider>;
}
