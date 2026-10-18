import { createContext, useMemo } from 'react';
import type * as t from '~/admin/types';
import { availableScopesOptions } from '~/admin/api';
import { getScopeIndex } from '~/admin/utils';
import { useQuery } from '~/admin/query';

/** Scope actions and the profile index of the configuration page (WS8). Null outside it. */
export const ScopeActionsContext = createContext<t.ScopeContextValue | null>(null);

const EMPTY_SCOPES: t.ConfigScope[] = [];

/**
 * Provides the page's scope switch (with its unsaved-changes guard) and the
 * profile index to the form, so a settings row finds the profiles that
 * override it with one lookup instead of its own query (WS8).
 */
export function ScopeActionsProvider({ value, children }: t.ScopeActionsProviderProps) {
  const { data: scopes = EMPTY_SCOPES } = useQuery(availableScopesOptions);
  const index = getScopeIndex(scopes);
  const context = useMemo(() => ({ ...value, index }), [value, index]);
  return <ScopeActionsContext.Provider value={context}>{children}</ScopeActionsContext.Provider>;
}
