import { getDefaultStore } from 'jotai';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

/**
 * The scope the admin panel acts in, in this tab: the platform, or one organization by its
 * tenant id. Kept per tab (session storage), so two tabs can work in two organizations; every
 * admin request names it, and changing it discards the panel's cached data.
 */
export const adminScopeAtom = atomWithStorage<string>(
  'librechat:adminScope',
  ADMIN_PLATFORM_SCOPE,
  createJSONStorage<string>(() => sessionStorage),
  { getOnInit: true },
);

/** The current scope, for the request layer, which runs outside React. */
export function getAdminScope(): string {
  return getDefaultStore().get(adminScopeAtom);
}
