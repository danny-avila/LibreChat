import { useCallback } from 'react';
import type * as t from '~/admin/types';
import { resolvedConfigOptions } from './layers';
import { baseConfigOptions } from '~/admin/api';
import { useQuery } from '~/admin/query';

/**
 * Whether the data the form edits has loaded: the base config, plus the open
 * profile's overrides in a profile (WS5: SH-1). The form must not mount before
 * `ready`, or edits are diffed against an empty baseline.
 */
export function useConfigBaseline(selectedScope: t.ScopeSelection): t.ConfigBaselineState {
  const base = useQuery(baseConfigOptions);
  const scope = useQuery(resolvedConfigOptions(selectedScope));
  const isEditingScope = selectedScope.type === 'SCOPE';

  const baseFailed = base.isError && base.data == null;
  const scopeFailed = isEditingScope && scope.isError && scope.data == null;
  const failedQuery = scopeFailed ? scope : null;
  const failed = baseFailed ? base : failedQuery;
  const { refetch } = failed ?? base;

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const basePending = base.data == null && (base.isPending || base.isFetching);
  const scopePending =
    isEditingScope && scope.data == null && (scope.isPending || scope.isFetching);

  if (failed && !failed.isFetching) return { status: 'error', error: failed.error, retry };
  if (basePending || scopePending) return { status: 'pending', error: null, retry };
  return { status: 'ready', error: null, retry };
}
