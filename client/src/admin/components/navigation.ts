import { useContext, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { SystemCapabilities } from '~/admin/constants';
import { AdminRouteContext } from '~/admin/router';
import { useCapabilities } from '~/admin/hooks';
import { adminScopeAtom } from '~/admin/store';

/** The panel's pages, in sidebar order. The sidebar and the command menu both list these. */
export const NAV_ITEMS: t.NavItem[] = [
  { labelKey: 'com_admin_nav_dashboard', path: '/', icon: 'home' },
  {
    labelKey: 'com_admin_nav_organizations',
    path: '/organizations',
    icon: 'building',
    scope: 'platform',
    organizationsOnly: true,
  },
  {
    labelKey: 'com_admin_nav_configuration',
    path: '/configuration',
    icon: 'settings',
    capability: SystemCapabilities.READ_CONFIGS,
  },
  {
    labelKey: 'com_admin_nav_users',
    path: '/users',
    icon: 'users',
    capability: SystemCapabilities.READ_USERS,
  },
  {
    labelKey: 'com_admin_nav_access',
    path: '/access',
    icon: 'user',
    capability: [SystemCapabilities.READ_ROLES, SystemCapabilities.READ_GROUPS],
    scope: 'organization',
  },
  { labelKey: 'com_admin_nav_grants', path: '/grants', icon: 'lock' },
  { labelKey: 'com_admin_nav_help', path: '/help', icon: 'question' },
];

/** Whether a page belongs to the scope the panel acts in. */
export function isInScope(item: t.NavItem, organizations: boolean, scope: string): boolean {
  if (!organizations) {
    return !item.organizationsOnly;
  }
  if (!item.scope) {
    return true;
  }
  const atPlatform = scope === ADMIN_PLATFORM_SCOPE;
  return item.scope === 'platform' ? atPlatform : !atPlatform;
}

/** The pages the signed-in operator can open at the current scope. */
export function useVisibleNavItems(): t.NavItem[] {
  const { organizations } = useContext(AdminRouteContext);
  const scope = useAtomValue(adminScopeAtom);
  const { hasCapability } = useCapabilities();
  return useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (!isInScope(item, organizations, scope)) return false;
        if (!item.capability) return true;
        if (Array.isArray(item.capability)) return item.capability.some((c) => hasCapability(c));
        return hasCapability(item.capability);
      }),
    [organizations, scope, hasCapability],
  );
}
