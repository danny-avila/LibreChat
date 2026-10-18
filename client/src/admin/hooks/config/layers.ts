import { useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  flattenObject,
  getValueAtPath,
  withScopeLayer,
  createBaseLayers,
  overlayPendingEdits,
  overriddenEntryKeys,
} from '~/admin/utils';
import {
  baseConfigOptions,
  getResolvedConfigFn,
  getLangfuseConnectionFn,
  LANGFUSE_CONNECTION_QUERY_KEY,
} from '~/admin/api';
import {
  collectFieldPaths,
  withLangfuseConfiguredPath,
} from '~/admin/components/configuration/counts';
import { mergeIndexedArrayEdits } from '~/admin/components/configuration/edits';
import { getFieldMeta } from '~/admin/components/configuration/meta';
import { queryOptions, useQuery } from '~/admin/query';
import { KEYED_COLLECTIONS } from '~/admin/constants';

const INDEXED_EDIT_PATH = /\.\d+$/;

/** The documented runtime default of a field, from its field meta (WS2 registry). */
export function runtimeDefaultAt(path: string): t.ConfigValue {
  return getFieldMeta(path)?.runtimeDefault;
}

export function resolvedConfigOptions(scope: t.ScopeSelection) {
  const principalType = scope.type === 'SCOPE' ? scope.scope.principalType : null;
  const principalId = scope.type === 'SCOPE' ? scope.scope.principalId : null;
  return queryOptions({
    queryKey: ['resolvedConfig', principalType, principalId] as const,
    queryFn: () =>
      getResolvedConfigFn({
        data: {
          principalType: principalType!,
          principalId: principalId!,
        },
      }),
    enabled: principalType != null && principalId != null,
    staleTime: 60_000,
  });
}

/**
 * The config layers the page reads (WS4: effective values): librechat.yaml
 * (raw paths and as LibreChat processes it), the base admin overrides, the
 * effective base config, and in a profile its own overrides and tombstones
 * merged over Base. Also the configured/override path sets, the
 * `ValueLayers` that `useFieldState` derives provenance from. Whether those
 * queries have loaded is `useConfigBaseline`'s (WS5).
 */
export function useConfigLayers({
  schemaTree,
  selectedScope,
  sectionPermissions,
}: t.ConfigLayersOptions): t.ConfigLayers {
  const baseQuery = useQuery(baseConfigOptions);
  const baseConfigData = baseQuery.data;
  const configValues = baseConfigData?.config ?? null;
  const dbOverrides = baseConfigData?.dbOverrides;
  const schemaDefaults = useMemo(
    () => baseConfigData?.schemaDefaults ?? {},
    [baseConfigData?.schemaDefaults],
  );

  const fieldPaths = useMemo(() => collectFieldPaths(schemaTree), [schemaTree]);
  const schemaPathSet = useMemo(() => new Set(fieldPaths), [fieldPaths]);

  /** Base-mode layers: librechat.yaml (raw paths and processed), base overrides and tombstones, effective base. */
  const baseLayers = useMemo(
    () =>
      baseConfigData ? createBaseLayers(baseConfigData, schemaPathSet, runtimeDefaultAt) : null,
    [baseConfigData, schemaPathSet],
  );

  const dbOverridePaths = useMemo(
    () => new Set(baseLayers?.baseOverridePaths.paths ?? []),
    [baseLayers],
  );

  /** What librechat.yaml or a base override sets; values LibreChat synthesizes at startup are not configured. */
  const configuredPaths = useMemo(
    () => new Set([...(baseLayers?.yamlPaths.paths ?? []), ...dbOverridePaths]),
    [baseLayers, dbOverridePaths],
  );

  const baseRecordKeys = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    const yamlMcpKeys = baseConfigData?.yamlMcpKeys;
    if (yamlMcpKeys && Array.isArray(yamlMcpKeys)) {
      result.mcpServers = new Set(yamlMcpKeys);
    }
    return result;
  }, [baseConfigData]);

  const isEditingScope = selectedScope.type === 'SCOPE';
  const openScope = selectedScope.type === 'SCOPE' ? selectedScope.scope : null;

  const scopeQuery = useQuery(resolvedConfigOptions(selectedScope));
  const scopeData = isEditingScope ? scopeQuery.data : undefined;

  /** Profile mode: Base merged with the profile's overrides, minus its tombstones (null until both load). */
  const valueLayers = useMemo((): t.ValueLayers | null => {
    if (!baseLayers || !isEditingScope) return baseLayers;
    if (!openScope || !scopeData) return null;
    return withScopeLayer(baseLayers, openScope, scopeData, schemaPathSet);
  }, [baseLayers, isEditingScope, openScope, scopeData, schemaPathSet]);

  /**
   * Overridden entries of each keyed list, by the edit target: Base's
   * overrides over librechat.yaml, or the open profile's over Base. A list a
   * profile replaces whole (model specs) is one override there, as its
   * overrides summary lists it (`listScopeOverrideItems`).
   */
  const listOverrideCounts = useMemo(() => {
    const scopeLayer = valueLayers?.scope;
    const stored = scopeLayer ? scopeLayer.overrides : (dbOverrides ?? null);
    const lower = scopeLayer ? (valueLayers?.base ?? null) : (baseConfigData?.yamlConfig ?? null);
    const counts = new Map<string, number>();
    for (const collection of KEYED_COLLECTIONS.values()) {
      const storedList = getValueAtPath(stored, collection.path);
      if (scopeLayer && collection.merge === 'replace') {
        counts.set(collection.path, Array.isArray(storedList) ? 1 : 0);
        continue;
      }
      const keys = overriddenEntryKeys(
        collection,
        storedList,
        getValueAtPath(lower, collection.path),
      );
      counts.set(collection.path, keys.size);
    }
    return counts;
  }, [valueLayers, dbOverrides, baseConfigData?.yamlConfig]);

  const baseActiveConfigValues = isEditingScope ? (valueLayers?.effective ?? null) : configValues;
  const flatBaseline = useMemo(
    () => flattenObject(baseActiveConfigValues ?? {}),
    [baseActiveConfigValues],
  );

  const scopeOverridePaths = useMemo(
    () => new Set(valueLayers?.scope?.overridePaths.paths ?? []),
    [valueLayers],
  );

  const scopeChangedPaths = useMemo(
    () => (scopeData ? Array.from(scopeOverridePaths) : null),
    [scopeData, scopeOverridePaths],
  );

  /** A profile customizes what it overrides and what it hides. */
  const scopeConfiguredPaths = useMemo(
    () => new Set([...scopeOverridePaths, ...(scopeData?.tombstones ?? [])]),
    [scopeOverridePaths, scopeData],
  );

  const { data: langfuseConnection } = useQuery({
    queryKey: LANGFUSE_CONNECTION_QUERY_KEY,
    queryFn: () => getLangfuseConnectionFn(),
    enabled:
      !isEditingScope &&
      schemaTree.some((section) => section.key === 'langfuse') &&
      sectionPermissions.langfuse?.canEdit === true,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const baseConfiguredPaths = useMemo(
    () => withLangfuseConfiguredPath(configuredPaths, langfuseConnection?.configured === true),
    [configuredPaths, langfuseConnection?.configured],
  );

  return {
    configValues,
    dbOverrides,
    yamlConfig: baseConfigData?.yamlConfig,
    yamlMcpServers: baseConfigData?.yamlMcpServers,
    schemaDefaults,
    flatBaseline,
    fieldPaths,
    schemaPathSet,
    dbOverridePaths,
    baseRecordKeys,
    scopeResolvedValues: isEditingScope && baseActiveConfigValues ? flatBaseline : null,
    scopeOverrideValues: scopeData?.resolvedConfig ?? null,
    scopeChangedPaths,
    baseActiveConfigValues,
    displayConfigValues: baseActiveConfigValues,
    activeConfiguredPaths: isEditingScope ? scopeConfiguredPaths : baseConfiguredPaths,
    overridePaths: isEditingScope ? scopeOverridePaths : dbOverridePaths,
    listOverrideCounts,
    valueLayers,
  };
}

/**
 * What a pending reset of a list or entry falls back to on the page: in base
 * mode librechat.yaml; in a profile the Base value (removing a profile's own
 * override reverts to what it inherits, SV-9).
 */
function pendingRevertValue(layers: t.ValueLayers | null | undefined, path: string): t.ConfigValue {
  if (!layers) return undefined;
  return getValueAtPath(layers.scope ? layers.base : layers.yamlEffective, path);
}

/**
 * Overlays every pending structural edit onto the displayed config (EV-6):
 * indexed array entries, whole lists (adds, deletes, reorders), new entries
 * and removed ones, so collection counts and the table of contents match the
 * page before saving. Primitive values are read by the fields themselves.
 */
export function usePendingConfigValues(
  displayConfigValues: Record<string, t.ConfigValue> | null,
  editedValues: t.FlatConfigMap,
  valueLayers?: t.ValueLayers | null,
): Record<string, t.ConfigValue> | null {
  return useMemo(() => {
    if (!displayConfigValues) return displayConfigValues;
    const indexed: Array<[string, t.ConfigValue]> = [];
    const structural: Array<[string, t.ConfigValue]> = [];
    for (const entry of Object.entries(editedValues)) {
      (INDEXED_EDIT_PATH.test(entry[0]) ? indexed : structural).push(entry);
    }
    if (indexed.length === 0 && structural.length === 0) return displayConfigValues;
    const withIndexed =
      indexed.length > 0
        ? mergeIndexedArrayEdits(displayConfigValues, indexed)
        : displayConfigValues;
    return overlayPendingEdits(withIndexed, structural, (path) =>
      pendingRevertValue(valueLayers, path),
    );
  }, [displayConfigValues, editedValues, valueLayers]);
}
