import { BASE_ONLY_CONFIG_SECTIONS, BASE_PRINCIPAL_CONFIG_SECTIONS } from 'librechat-data-provider';
import type * as t from '~/admin/types';

/**
 * LibreChat's request sanitizer silently drops object keys that contain `.` or
 * start with `$` from every admin config write, so the panel blocks them up
 * front. Set to `false` once the admin config API accepts such keys.
 */
export const BLOCK_UNSAFE_CONFIG_KEYS = true;

/** Why a key blocked by `BLOCK_UNSAFE_CONFIG_KEYS` cannot be saved or imported. */
export const UNSAFE_CONFIG_KEY_MESSAGE =
  "keys containing '.' or starting with '$' can't be saved through the admin API yet; set this in librechat.yaml";

/**
 * Top-level sections the panel must never write, with the reason shown in the
 * UI. Base-only sections are stripped by the admin API for every principal;
 * the YAML-only ones are read from the raw librechat.yaml at startup or before
 * login, so overrides have no effect.
 */
export const READ_ONLY_CONFIG_SECTIONS: ReadonlyMap<string, t.ReadOnlyReason> = new Map<
  string,
  t.ReadOnlyReason
>([
  ...BASE_ONLY_CONFIG_SECTIONS.map((section): [string, t.ReadOnlyReason] => [section, 'baseOnly']),
  ['cloudfront', 'yamlOnly'],
  ['rateLimits', 'yamlOnly'],
  ['turnstile', 'yamlOnly'],
  /** Only librechat.yaml's own loader knows it; AppService never carries it into the app config. */
  ['cache', 'yamlOnly'],
]);

/**
 * Tenant-wide sections with their own admin API (e.g. the Langfuse connection).
 * The generic config API strips them, so saves and imports never send them.
 */
export const DEDICATED_CONFIG_SECTIONS: ReadonlySet<string> = new Set(
  BASE_PRINCIPAL_CONFIG_SECTIONS,
);

/** AppService output names for config sections, mapped to their canonical config keys. */
export const APP_SERVICE_KEY_ALIASES: Readonly<Record<string, string>> = {
  interfaceConfig: 'interface',
  turnstileConfig: 'turnstile',
  mcpConfig: 'mcpServers',
};

/**
 * Fields LibreChat only processes from librechat.yaml (overrides are merged
 * after `azureConfigSetup`/`vertexConfigSetup` run), so edits would be silent
 * no-ops. Rendered read-only until the backend re-processes overrides.
 */
export const YAML_MANAGED_FIELDS: ReadonlySet<string> = new Set([
  'endpoints.azureOpenAI.groups',
  'endpoints.anthropic.vertex',
]);

/** Config keys for values that must never be displayed in plain text. */
export const SECRET_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'apiKey',
  'serviceKey',
  'secretKey',
  'clientSecret',
  'client_secret',
]);

/** Locale keys explaining why a pending change is not sent or was not stored. */
export const SKIP_REASON_KEYS: Readonly<Record<t.SkipReason, string>> = {
  baseOnly: 'com_admin_config_skip_base_only',
  yamlOnly: 'com_admin_config_skip_yaml_only',
  permission: 'com_admin_config_skip_permission',
  dedicated: 'com_admin_config_skip_dedicated',
  yamlValue: 'com_admin_config_skip_yaml_value',
  empty: 'com_admin_config_skip_empty',
  notStored: 'com_admin_config_skip_not_stored',
  notApplied: 'com_admin_config_skip_not_applied',
  yamlMerged: 'com_admin_config_skip_yaml_merged',
  baseScope: 'com_admin_scope_skip_base_scope',
  inheritedValue: 'com_admin_scope_skip_inherited_value',
  inheritedMerged: 'com_admin_scope_skip_inherited_merged',
};

/** The top-level config section of a dot-path (`balance.startBalance` → `balance`). */
export function getConfigSection(path: string): string {
  const dot = path.indexOf('.');
  return dot === -1 ? path : path.slice(0, dot);
}

/** The top-level section a dot-path belongs to, when that section is read-only. */
export function getReadOnlyReason(path: string): t.ReadOnlyReason | undefined {
  return READ_ONLY_CONFIG_SECTIONS.get(getConfigSection(path));
}

/** Whether `path` is, or is inside, a field managed only in librechat.yaml. */
export function isYamlManagedPath(path: string): boolean {
  for (const managed of YAML_MANAGED_FIELDS) {
    if (path === managed || path.startsWith(`${managed}.`)) return true;
  }
  return false;
}
