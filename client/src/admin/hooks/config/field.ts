import { useContext, useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  getEntryKey,
  isConfigRecord,
  getValueAtPath,
  deriveFieldState,
  isConfigValueEqual,
  getKeyedCollection,
  overriddenEntryKeys,
} from '~/admin/utils';
import { getRevertLabels } from '~/admin/components/configuration/values/labels';
import { ConfigErrorsContext } from '~/admin/contexts/ConfigErrorsContext';
import { ConfigValuesContext } from '~/admin/contexts/ConfigValuesContext';
import { useLocalize } from '../useLocalize';

/**
 * State of one field (value, effective value, provenance, revert target,
 * edit flags) from the nearest `ConfigValuesProvider` (WS4; consumed by WS3,
 * WS6 and WS9–13). Outside a provider it returns an empty default state.
 */
export function useFieldState(path: string): t.FieldState {
  const data = useContext(ConfigValuesContext);
  const error = useContext(ConfigErrorsContext)?.[path];
  return useMemo(() => {
    const state = deriveFieldState(path, data);
    return error ? { ...state, error } : state;
  }, [path, data, error]);
}

/** The save pipeline's error for a field's pending value, if any (WS1 errors map). */
export function useFieldError(path: string): string | undefined {
  return useContext(ConfigErrorsContext)?.[path];
}

/** Whether the nearest `ConfigValuesProvider` has the layer model (provenance is known). */
export function useHasValueLayers(): boolean {
  return useContext(ConfigValuesContext)?.layers != null;
}

/** The open profile's layer from the nearest `ConfigValuesProvider` (null in base mode). */
export function useValuesScope(): t.ScopeLayer | null {
  return useContext(ConfigValuesContext)?.layers?.scope ?? null;
}

/**
 * Label and accessible name of a field's revert action (EV-4), e.g. "Revert
 * to librechat.yaml (1,000,000)" or "Remove override (inherits On from
 * Base)". Undefined when the edit target holds no override for the field.
 */
export function useRevertLabels(path: string, name: string): t.RevertLabels | undefined {
  const localize = useLocalize();
  const state = useFieldState(path);
  const scope = useValuesScope();
  return useMemo(
    () => getRevertLabels(state, name, localize, path, scope),
    [state, name, localize, path, scope],
  );
}

/**
 * Keys of the entries of a keyed list (`endpoints.custom` by `name`) or of a
 * record (`mcpServers`) that the layer beneath the edit target defines:
 * librechat.yaml in Base, the Base config in a profile. Those entries can be
 * edited but not removed or renamed here (D1); empty outside a provider with
 * the layer model.
 */
export function useLowerEntryKeys(listPath: string, keyField = 'name'): ReadonlySet<string> {
  const layers = useContext(ConfigValuesContext)?.layers;
  return useMemo(() => {
    const lower = layers?.scope ? layers.base : layers?.yamlEffective;
    const list = getValueAtPath(lower ?? null, listPath);
    if (isConfigRecord(list)) return new Set(Object.keys(list));
    const keys = new Set<string>();
    if (!Array.isArray(list)) return keys;
    for (const entry of list) {
      const key = isConfigRecord(entry) ? entry[keyField] : undefined;
      if (typeof key === 'string') keys.add(key);
    }
    return keys;
  }, [layers, listPath, keyField]);
}

/**
 * Header markers for the entries of a keyed list (custom endpoints, model
 * specs), by identity: whether the edit target's stored override adds or
 * changes the entry (Base's overrides over librechat.yaml, or the open
 * profile's over Base), and whether the entry differs from its saved value.
 * Undefined for other lists, or outside a provider with the layer model.
 */
export function useEntryMarkers(
  listPath: string | undefined,
): ((item: t.ConfigValue) => t.EntryMarkers | undefined) | undefined {
  const layers = useContext(ConfigValuesContext)?.layers;
  return useMemo(() => {
    const collection = listPath ? getKeyedCollection(listPath) : undefined;
    if (!collection || !layers) return undefined;
    const { path, key } = collection;
    const stored = layers.scope ? layers.scope.overrides : layers.baseOverrides;
    const lower = layers.scope ? layers.base : layers.yamlEffective;
    const lowerList = getValueAtPath(lower, path);
    const overridden = overriddenEntryKeys(collection, getValueAtPath(stored, path), lowerList);
    const lowerKeys = new Set<string>();
    for (const entry of Array.isArray(lowerList) ? lowerList : []) {
      const identity = getEntryKey(entry, key);
      if (identity !== undefined) lowerKeys.add(identity);
    }
    const saved = getValueAtPath(layers.effective, path);
    const savedByKey = new Map<string, t.ConfigValue>();
    for (const entry of Array.isArray(saved) ? saved : []) {
      const identity = getEntryKey(entry, key);
      if (identity !== undefined) savedByKey.set(identity, entry);
    }
    return (item) => {
      const identity = getEntryKey(item, key);
      if (identity === undefined) return undefined;
      const before = savedByKey.get(identity);
      const isOverridden = overridden.has(identity);
      return {
        overridden: isOverridden,
        added: isOverridden && !lowerKeys.has(identity),
        edited: before !== undefined && !isConfigValueEqual(before, item),
      };
    };
  }, [listPath, layers]);
}

/** Whether a stored value is an override (the empty objects LibreChat leaves behind after a reset are not). */
function isStoredOverride(value: t.ConfigValue): boolean {
  if (value === undefined) return false;
  return !isConfigRecord(value) || Object.keys(value).length > 0;
}

/**
 * Whether the edit target overrides an entry of a record collection
 * (`mcpServers`), by key, and whether the layer beneath defines it (else the
 * target added it). Their fields are stored by path, so anything stored under
 * the entry's key is an override. Undefined outside a provider with the layer model.
 */
export function useRecordEntryOverrides(
  recordPath: string,
): ((key: string) => Pick<t.EntryMarkers, 'overridden' | 'added'>) | undefined {
  const layers = useContext(ConfigValuesContext)?.layers;
  return useMemo(() => {
    if (!layers) return undefined;
    const stored = getValueAtPath(
      layers.scope ? layers.scope.overrides : layers.baseOverrides,
      recordPath,
    );
    const lower = getValueAtPath(layers.scope ? layers.base : layers.yamlEffective, recordPath);
    const storedRecord = isConfigRecord(stored) ? stored : {};
    const lowerRecord = isConfigRecord(lower) ? lower : {};
    return (key) => {
      const overridden = Object.hasOwn(storedRecord, key) && isStoredOverride(storedRecord[key]);
      return { overridden, added: overridden && !Object.hasOwn(lowerRecord, key) };
    };
  }, [layers, recordPath]);
}

/** Whether `endpoints.all` exists, so LibreChat reads title settings only from it (D11). */
export function useGlobalTitleBlock(): boolean {
  const data = useContext(ConfigValuesContext);
  const root = data?.configValues ?? data?.layers?.effective ?? null;
  return isConfigRecord(getValueAtPath(root, 'endpoints.all'));
}
