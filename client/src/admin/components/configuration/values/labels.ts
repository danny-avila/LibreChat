import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { MASKED_SECRET, isEnvReference } from '~/admin/utils';

const MAX_TEXT_LENGTH = 40;

/** Keys whose values are credentials; their text never reaches chips or labels. */
const SECRET_KEY_PATTERN = /(apikey|secret|password|token|servicekey)$/i;

const SCOPE_SOURCE_KEYS: Readonly<Partial<Record<PrincipalType, string>>> = {
  [PrincipalType.ROLE]: 'com_admin_config_values_source_role',
  [PrincipalType.GROUP]: 'com_admin_config_values_source_group',
  [PrincipalType.USER]: 'com_admin_config_values_source_user',
};

const SOURCE_KEYS: Readonly<Record<t.ProvenanceSource, string>> = {
  default: 'com_admin_config_values_source_default',
  runtimeDefault: 'com_admin_config_values_source_runtime',
  yaml: 'com_admin_config_values_source_yaml',
  admin: 'com_admin_config_values_source_admin',
  scope: 'com_admin_config_values_source_scope',
  inherited: 'com_admin_config_values_source_inherited',
};

/** Revert label and accessible-name keys by the layer a field reverts to. */
const REVERT_KEYS: Readonly<Record<t.ProvenanceSource, { label: string; aria: string }>> = {
  yaml: {
    label: 'com_admin_config_values_revert_yaml',
    aria: 'com_admin_config_values_revert_yaml_aria',
  },
  default: {
    label: 'com_admin_config_values_revert_default',
    aria: 'com_admin_config_values_revert_default_aria',
  },
  runtimeDefault: {
    label: 'com_admin_config_values_revert_runtime',
    aria: 'com_admin_config_values_revert_runtime_aria',
  },
  inherited: {
    label: 'com_admin_config_values_revert_inherited',
    aria: 'com_admin_config_values_revert_inherited_aria',
  },
  admin: {
    label: 'com_admin_config_values_revert_inherited',
    aria: 'com_admin_config_values_revert_inherited_aria',
  },
  scope: {
    label: 'com_admin_config_values_revert_inherited',
    aria: 'com_admin_config_values_revert_inherited_aria',
  },
};

function lastSegment(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? path : path.slice(dot + 1);
}

/**
 * Short display text for a config value in chips, hover cards and revert
 * labels: On/Off, grouped numbers, truncated text, item counts for lists and
 * objects, and a mask for credentials.
 */
export function formatConfigValue(value: t.ConfigValue, localize: t.LocalizeFn, path = ''): string {
  if (value === undefined || value === null || value === '') {
    return localize('com_admin_config_values_not_set');
  }
  if (typeof value === 'boolean') {
    return localize(value ? 'com_admin_config_values_on' : 'com_admin_config_values_off');
  }
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(lastSegment(path)) && !isEnvReference(value)) return MASKED_SECRET;
    return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH - 1)}…` : value;
  }
  if (Array.isArray(value))
    return localize('com_admin_config_values_items', { count: value.length });
  return localize('com_admin_config_values_keys', { count: Object.keys(value).length });
}

/** Layers that store their own values; a secret they hold comes back redacted (no value). */
const STORING_SOURCES: ReadonlySet<t.ProvenanceSource> = new Set(['admin', 'scope']);

/**
 * One layer of the hover stack: Hidden for a tombstone, the masked secret for
 * a secret an override stores (the backend redacts it, so it has no value
 * here), else the value.
 */
export function formatLayerValue(layer: t.FieldLayer, localize: t.LocalizeFn, path = ''): string {
  if (layer.hidden) return localize('com_admin_config_values_source_hidden');
  const isRedacted =
    layer.value === undefined &&
    STORING_SOURCES.has(layer.source) &&
    SECRET_KEY_PATTERN.test(lastSegment(path));
  return isRedacted ? MASKED_SECRET : formatConfigValue(layer.value, localize, path);
}

/** "Role: USER", "Group: Design", or the profile name. */
export function scopeSourceLabel(
  scope: Pick<t.ScopeLayer, 'principalType' | 'name'> | null | undefined,
  localize: t.LocalizeFn,
): string {
  if (!scope) return localize(SOURCE_KEYS.scope, { name: '' }).trim();
  return localize(SCOPE_SOURCE_KEYS[scope.principalType] ?? SOURCE_KEYS.scope, {
    name: scope.name,
  });
}

/** Display name of a value layer. */
export function sourceLabel(
  source: t.ProvenanceSource,
  localize: t.LocalizeFn,
  scope?: Pick<t.ScopeLayer, 'principalType' | 'name'> | null,
): string {
  if (source === 'scope') return scopeSourceLabel(scope, localize);
  return localize(SOURCE_KEYS[source], { name: scope?.name ?? '' });
}

/**
 * Label and accessible name of a field's revert action (EV-4): what removing
 * the edit target's own override falls back to, e.g. "Revert to
 * librechat.yaml (1,000,000)" or "Remove override (inherits On from Base)".
 * Undefined when the field has no override to revert.
 */
export function getRevertLabels(
  state: t.FieldState,
  name: string,
  localize: t.LocalizeFn,
  path = '',
  scope?: Pick<t.ScopeLayer, 'principalType' | 'name'> | null,
): t.RevertLabels | undefined {
  const target = state.revertTarget;
  if (!target) return undefined;
  const value = formatConfigValue(target.value, localize, path);
  const keys = REVERT_KEYS[target.source];
  const options = { name, value, scope: scopeSourceLabel(scope, localize) };
  if (target.value === undefined && target.source === 'default') {
    return {
      label: localize('com_admin_config_values_revert_unset'),
      ariaLabel: localize('com_admin_config_values_revert_unset_aria', options),
    };
  }
  return { label: localize(keys.label, options), ariaLabel: localize(keys.aria, options) };
}

/** Accessible summary of where a value comes from, e.g. "Default 20,000 · librechat.yaml 1,000,000". */
export function describeStack(
  state: t.FieldState,
  localize: t.LocalizeFn,
  path = '',
  scope?: Pick<t.ScopeLayer, 'principalType' | 'name'> | null,
): string {
  return (state.stack ?? [])
    .map((layer) => {
      const label = sourceLabel(layer.source, localize, scope);
      return `${label} ${formatLayerValue(layer, localize, path)}`;
    })
    .join(' · ');
}
