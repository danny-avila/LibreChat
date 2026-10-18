import { useCallback, useMemo } from 'react';
import { getEffectiveCapabilitiesFn } from '~/admin/api';
import { hasImpliedCapability } from '~/admin/constants';
import { getRouteApi } from '~/admin/router';
import { useQuery } from '~/admin/query';

const Route = getRouteApi('/_app');

/** Status codes that indicate the grants system is not deployed (vs. access denied). */
const GRANTS_UNAVAILABLE_PATTERN = /\b(404|503)\b|endpoint not found|fetch failed/i;
const AUTH_DENIED_PATTERN =
  /\b(401|403)\b|forbidden|unauthorized|authentication required|no admin session token/i;

export function useCapabilities(): {
  capabilities: string[];
  hasCapability: (cap: string) => boolean;
  isLoading: boolean;
  isError: boolean;
} {
  const { user } = Route.useRouteContext();
  const query = useQuery({
    queryKey: ['effectiveCapabilities', user?.id ?? ''],
    queryFn: async () => {
      try {
        const res = await getEffectiveCapabilitiesFn();
        return { available: true, capabilities: res.capabilities };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (GRANTS_UNAVAILABLE_PATTERN.test(message)) {
          return { available: false, capabilities: [] as string[] };
        }
        if (AUTH_DENIED_PATTERN.test(message)) {
          return { available: true, capabilities: [] as string[] };
        }
        throw err;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  const grantsAvailable = query.data?.available ?? false;
  const held = query.data?.capabilities;
  const capabilities = useMemo(() => held ?? [], [held]);

  const hasCapability = useCallback(
    (_cap: string) => {
      if (!grantsAvailable) return false;
      return hasImpliedCapability(capabilities, _cap);
    },
    [grantsAvailable, capabilities],
  );

  return { capabilities, hasCapability, isLoading: query.isLoading, isError: query.isError };
}
