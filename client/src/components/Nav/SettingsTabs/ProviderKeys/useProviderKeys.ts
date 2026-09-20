import { useMemo, useRef } from 'react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { MediaStartupConfig } from 'librechat-data-provider';
import type { MediaQueryScope } from '~/data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { useMediaAccess } from '~/hooks/Media/useMediaAccess';
import { getUserKeyEndpoints } from './utils';
import { useHasAccess } from '~/hooks';

/** Determines visibility without fetching provider models or credentials. */
export function useMediaProviderKeyScope():
  | (MediaQueryScope & Pick<MediaStartupConfig, 'integrations'>)
  | undefined {
  const { media, scope, enabled } = useMediaAccess();
  const current = useRef({ scope, enabled });
  current.current = { scope, enabled };
  return useMemo(
    () =>
      enabled && scope && media
        ? {
            scope,
            integrations: media.integrations,
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
