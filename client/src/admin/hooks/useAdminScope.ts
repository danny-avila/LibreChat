import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_BASE_PATH } from '~/admin/router';
import { useQueryClient } from '~/admin/query';
import { adminScopeAtom } from '~/admin/store';

/** The router state a scope switch travels in. */
const SCOPE_STATE_KEY = 'adminScope';

/** Queries that are about the operator, not the scope, and survive a switch. */
const SCOPE_INDEPENDENT_QUERIES = new Set(['adminSession']);

/**
 * Moves the panel to another scope (the platform, or one organization). The switch is a
 * navigation to the dashboard carrying the new scope, so the configuration page's unsaved-edits
 * guard can hold it like any other way out; the scope changes only once the navigation lands.
 */
export function useSwitchAdminScope(): (scope: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (scope: string) => navigate(ADMIN_BASE_PATH, { state: { [SCOPE_STATE_KEY]: scope } }),
    [navigate],
  );
}

/**
 * Applies a scope switch once its navigation lands: stores the scope, resets every cached answer
 * from the previous scope (the pages on screen refetch in the new one), and clears the request
 * from history so Back never replays it. Rendered once, by the panel's layout.
 */
export function useApplyScopeSwitch(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scope, setScope] = useAtom(adminScopeAtom);
  const state = location.state as Record<string, unknown> | null;
  const requested = state?.[SCOPE_STATE_KEY];

  useEffect(() => {
    if (typeof requested !== 'string') {
      return;
    }
    if (requested !== scope) {
      setScope(requested);
      void queryClient.resetQueries({
        predicate: (query) => !SCOPE_INDEPENDENT_QUERIES.has(String(query.queryKey[0])),
      });
    }
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null },
    );
  }, [
    requested,
    scope,
    setScope,
    queryClient,
    navigate,
    location.pathname,
    location.search,
    location.hash,
  ]);
}
