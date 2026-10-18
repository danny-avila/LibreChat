import { useMemo } from 'react';
import type * as t from '~/admin/types';
import { buildConfigSearchIndex } from '~/admin/components/configuration/search';
import { baseConfigOptions, configSchemaTreeOptions } from '~/admin/api';
import { useCapabilities } from './useCapabilities';
import { hasConfigCapability } from '~/admin/utils';
import { useQuery } from '~/admin/query';

/**
 * The configuration search index for the command menu (WS5: SH-3): every
 * schema leaf the viewer may read, plus the entries of the base config with
 * current values. Loads once the menu opens.
 */
export function useSearchIndex(
  localize: t.LocalizeFn,
  shouldLoad: boolean,
): { items: t.ConfigSearchItem[]; loading: boolean } {
  const { hasCapability } = useCapabilities();
  const canReadAll = hasConfigCapability(hasCapability, null, 'read');

  const { data: tree, isLoading } = useQuery({ ...configSchemaTreeOptions, enabled: shouldLoad });
  const { data: base } = useQuery({ ...baseConfigOptions, enabled: shouldLoad && canReadAll });
  const values = base?.config;

  const items = useMemo(() => {
    if (!tree) return [];
    const readable = tree.filter((section) =>
      hasConfigCapability(hasCapability, section.key, 'read'),
    );
    return buildConfigSearchIndex(readable, values, localize);
  }, [tree, values, localize, hasCapability]);

  return { items, loading: isLoading };
}

/**
 * The search index of the configuration page's own values (open profile,
 * pending list edits), built only while `enabled` (the tab filter has text).
 */
export function useConfigSearchIndex(
  tree: t.SchemaField[],
  values: t.ConfigSearchValues,
  localize: t.LocalizeFn,
  enabled: boolean,
): t.ConfigSearchItem[] {
  return useMemo(
    () => (enabled ? buildConfigSearchIndex(tree, values, localize) : []),
    [tree, values, localize, enabled],
  );
}
