import { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import type * as t from '~/admin/types';
import {
  getScopeIndex,
  applyScopeGates,
  parseScopeParam,
  findScopeByParam,
  formatScopeParam,
} from '~/admin/utils';
import { ScopeActionsContext } from '~/admin/contexts/ScopeContext';
import { availableScopesOptions } from '~/admin/api';
import { useNavigate } from '~/admin/router';
import { useQuery } from '~/admin/query';

const EMPTY_SCOPES: t.ConfigScope[] = [];

const BASE_SELECTION: t.ScopeSelection = { type: 'BASE' };

/**
 * The open profile (scope), derived from `?scope=` — the URL is the single
 * source of truth, so Back/Forward switch profiles and a fresh visit opens
 * Base (D7) — and the scope selector dialog state (WS8; URL wiring WS5/SH-5).
 */
export function useScopeSelection({
  initialScope,
}: t.ScopeSelectionOptions): t.ScopeSelectionState {
  const navigate = useNavigate({ from: '/configuration/' });
  const [scopeSelectorOpen, setScopeSelectorOpen] = useState(false);
  /** The profile picked last: a just-created one may not be in the cached list yet. */
  const [pickedScope, setPickedScope] = useState<t.ConfigScope | null>(null);

  const param = useMemo(() => parseScopeParam(initialScope), [initialScope]);
  const {
    data: allScopes,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    ...availableScopesOptions,
    enabled: param != null,
  });
  const retryScopes = useCallback(() => {
    refetch();
  }, [refetch]);

  const match = useMemo(() => {
    if (!param) return undefined;
    const known = pickedScope ? [pickedScope, ...(allScopes ?? [])] : (allScopes ?? []);
    return findScopeByParam(known, param);
  }, [param, allScopes, pickedScope]);

  const selectedScope = useMemo<t.ScopeSelection>(
    () => (match ? { type: 'SCOPE', scope: match } : BASE_SELECTION),
    [match],
  );

  /** A legacy `_id` link is rewritten to the `type:id` form. */
  useEffect(() => {
    if (!match || param?.kind !== 'id') return;
    navigate({
      search: (prev: t.ConfigSearchParams) => ({ ...prev, scope: formatScopeParam(match) }),
      replace: true,
    });
  }, [match, param, navigate]);

  const selectScope = useCallback(
    (newSelection: t.ScopeSelection) => {
      if (newSelection.type === 'SCOPE') setPickedScope(newSelection.scope);
      const scope =
        newSelection.type === 'SCOPE' ? formatScopeParam(newSelection.scope) : undefined;
      navigate({
        search: (prev: t.ConfigSearchParams) => ({
          ...prev,
          scope,
          customized: undefined,
          field: undefined,
        }),
      });
    },
    [navigate],
  );

  const isEditingScope = selectedScope.type === 'SCOPE';
  const editingScope: t.ConfigScope | undefined =
    selectedScope.type === 'SCOPE' ? selectedScope.scope : undefined;

  return {
    selectedScope,
    selectScope,
    isEditingScope,
    editingScope,
    scopeSelectorOpen,
    setScopeSelectorOpen,
    isResolvingScope: param != null && !match && (isPending || isError),
    scopeNotFound: param != null && !match && !isPending && !isError ? initialScope : undefined,
    scopeLoadError: param != null && !match && isError ? error : null,
    retryScopes,
  };
}

/**
 * Every profile, indexed by the paths it overrides or hides (WS8). Built from
 * the shared scopes list, so it costs no request of its own.
 */
export function useScopeIndex(): t.ScopeIndex {
  const { data: scopes = EMPTY_SCOPES } = useQuery(availableScopesOptions);
  return getScopeIndex(scopes);
}

/** The page's scope actions and profile index, or null outside the configuration page (WS8). */
export function useScopeActions(): t.ScopeContextValue | null {
  return useContext(ScopeActionsContext);
}

/**
 * Profiles that override `path` (or something inside it), lowest priority
 * first, for the field cascade on a settings row (WS8: PR-8). Undefined in a
 * profile, outside the configuration page, or when no profile overrides it.
 */
export function useFieldProfiles(path?: string): t.ConfigScope[] | undefined {
  const context = useContext(ScopeActionsContext);
  if (!path || !context || context.editingScope) return undefined;
  return context.index.byPath.get(path);
}

/**
 * The tab's sections with, in a profile, the ones that apply to everyone
 * marked `scopeGate` so they render as an "edit in Base" card (WS8: PR-7).
 */
export function useScopeGatedSections(
  sections: t.ConfigSectionConfig[],
  isEditingScope: boolean,
): t.ConfigSectionConfig[] {
  return useMemo(() => applyScopeGates(sections, isEditingScope), [sections, isEditingScope]);
}
