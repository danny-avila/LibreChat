import { useMemo, useRef } from 'react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { MediaQueryScope } from '~/data-provider/Media/queries';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { mediaSessionScope } from '~/routes/mediaHandoff';
import { useAuthContext, useHasAccess } from '~/hooks';
import { getUserKeyEndpoints } from './utils';

/** Determines visibility without fetching provider models or credentials. */
export function useMediaProviderKeyScope(): MediaQueryScope | undefined {
  const { user, isAuthenticated } = useAuthContext();
  const { data: startup } = useGetStartupConfig();
  const canUse = useHasAccess({
    permissionType: PermissionTypes.MEDIA,
    permission: Permissions.USE,
  });
  const media = startup?.media;
  const scope = user ? mediaSessionScope(user) : undefined;
  const enabled = !!scope && isAuthenticated && canUse === true && media?.enabled === true;
  const current = useRef({ scope, enabled });
  current.current = { scope, enabled };
  return useMemo(
    () =>
      enabled && scope && media
        ? {
            scope,
            pollIntervalMs: media.clientPollIntervalMs,
            catchUpIntervalMs: media.clientCatchUpIntervalMs,
            isCurrentSession: () => current.current.enabled && current.current.scope === scope,
          }
        : undefined,
    [enabled, scope, media],
  );
}

/**
 * Reachable endpoints requiring a user-provided key, filtered the same way the model
 * selector and mention popover are (modelSpecs, addedEndpoints, agent allowedProviders).
 */
export default function useProviderKeys(): string[] {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  return useMemo(
    () =>
      getUserKeyEndpoints({
        endpointsConfig,
        modelSpecs: startupConfig?.modelSpecs,
        hasAgentAccess: hasAgentAccess === true,
      }),
    [endpointsConfig, startupConfig?.modelSpecs, hasAgentAccess],
  );
}
