import type * as t from '~/admin/types';
import { isConfigValueEqual } from '~/admin/utils';

/** In a profile: Base sets the value (librechat.yaml or an admin override), not a default. */
export function inheritsSetting(state: t.FieldState): boolean {
  const source = state.inherited?.source;
  return source === 'yaml' || source === 'admin';
}

/**
 * What "Default" means for a top-level field: whether the edit target holds
 * its own value, and the value (and layer) in effect without it. Uses WS4's
 * `revertTarget` when present; otherwise the effective value (no own value) or
 * the schema default, then `FieldMeta.runtimeDefault`.
 */
export function deriveFieldDefault(
  state: t.FieldState,
  meta: t.FieldMeta | undefined,
  schemaDefault: t.ConfigValue,
): t.FieldDefault {
  const hasOwnValue = !state.isPendingReset && (state.isOverride || state.isEdited);
  /** Unset here while Global sets it: users get Global's value, so Default names it (D11). */
  if (!hasOwnValue && state.shadowedBy && state.shadowedBy.value !== undefined) {
    return { hasOwnValue, value: state.shadowedBy.value, source: 'default', fromGlobal: true };
  }
  if (state.revertTarget) {
    return {
      hasOwnValue,
      value: state.revertTarget.value ?? meta?.runtimeDefault,
      source: state.revertTarget.source,
    };
  }
  if (!state.isOverride) {
    const value = state.effective ?? schemaDefault;
    const fromLayer =
      state.isConfigured || (state.source === 'inherited' && inheritsSetting(state));
    const source = state.effective !== undefined && fromLayer ? state.source : 'default';
    if (value !== undefined) return { hasOwnValue, value, source };
    return { hasOwnValue, value: meta?.runtimeDefault, source: 'runtimeDefault' };
  }
  const source: t.ProvenanceSource = state.source === 'scope' ? 'inherited' : 'default';
  if (schemaDefault !== undefined) return { hasOwnValue, value: schemaDefault, source };
  return { hasOwnValue, value: meta?.runtimeDefault, source: 'runtimeDefault' };
}

/**
 * The value the layer beneath the edit target gives a field (librechat.yaml
 * in Base, Base in a profile), when the target holds no override of it: the
 * value Default stands for, and one that cannot be removed here (D3).
 */
export function lowerLayerValue(state: t.FieldState): t.RevertTarget | undefined {
  if (state.isOverride || state.isHidden || state.effective === undefined) return undefined;
  if (state.source === 'yaml') return { value: state.effective, source: 'yaml' };
  if (state.source === 'inherited' && inheritsSetting(state)) {
    return { value: state.effective, source: 'inherited' };
  }
  return undefined;
}

/** A revert target only when it is a value a layer sets (librechat.yaml, or Base in a profile), not a default. */
export function layerRevertTarget(target: t.RevertTarget | undefined): t.RevertTarget | undefined {
  if (target?.value === undefined) return undefined;
  return target.source === 'yaml' || target.source === 'inherited' ? target : undefined;
}

/**
 * "Default" for a value inside a collection entry: what the layer beneath
 * sets for this entry (an override reverts to it; with no override it is
 * the value shown, and not one the target owns), else the runtime default.
 */
export function entryFieldDefault(
  value: t.ConfigValue,
  meta: t.FieldMeta | undefined,
  state: t.FieldState,
): t.FieldDefault {
  if (value === undefined && state.shadowedBy && state.shadowedBy.value !== undefined) {
    return {
      hasOwnValue: false,
      value: state.shadowedBy.value,
      source: 'default',
      fromGlobal: true,
    };
  }
  const lower = state.isOverride ? state.revertTarget : lowerLayerValue(state);
  if (lower?.value === undefined) {
    return {
      hasOwnValue: value !== undefined,
      value: meta?.runtimeDefault,
      source: 'runtimeDefault',
    };
  }
  const ownsValue = state.isOverride || !isConfigValueEqual(value, lower.value);
  return {
    hasOwnValue: value !== undefined && ownsValue,
    value: lower.value,
    source: lower.source,
  };
}

/**
 * Keys the layer beneath sets inside an object value (librechat.yaml or
 * Base). LibreChat merges an override over them, so a value can change them
 * but never drop them (D3): switching a variant away from them is blocked.
 */
export function lowerLayerKeys(state: t.FieldState): string[] {
  const target = state.isOverride ? state.revertTarget : lowerLayerValue(state);
  if (!target || (target.source !== 'yaml' && target.source !== 'inherited')) return [];
  const { value } = target;
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
}
