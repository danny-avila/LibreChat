import { configSchema, isProcessMCPServerConfig } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  flattenImport,
  findUnsafeKeys,
  isConfigRecord,
  resolveSubSchema,
  scopeGateSkipReason,
  getWriteSkipReason,
  findYamlManagedValues,
  secretPathForPreviewPath,
  stripSecretPreviewValues,
} from '~/admin/utils';
import { SKIP_REASON_KEYS } from '~/admin/constants';
import { findSchemaField } from './controls';
import { normalizeForSave } from './edits';

/** Locale keys for why an imported key is left out. */
export const IMPORT_SKIP_KEYS: Readonly<Record<t.ImportSkipReason, string>> = {
  ...SKIP_REASON_KEYS,
  unsafeKey: 'com_admin_config_review_import_skip_unsafe',
  processMcp: 'com_admin_config_review_import_skip_process',
};

/**
 * One save entry per leaf of the imported YAML, minus metadata, empty objects
 * and redacted secret companions. Each value is normalized like a pending
 * edit (`normalizeForSave`), so blank list items are dropped; a leaf left with
 * no value (`allowedDomains: [""]`, `titleModel: ""`) is reported as skipped
 * instead of being stored as an empty override that LibreChat would read as
 * "allow nothing". Keys the admin API can't store are reported as `unsafeKey`
 * (with the object holding them) instead of being split into nested paths.
 */
export function collectImportEntries(
  appConfig: t.ConfigRecord,
  fields: t.SchemaField[],
  schemaPathSet: ReadonlySet<string>,
): t.ImportEntries {
  const entries: t.SaveEntry[] = [];
  const skipped: t.ImportSkippedKey[] = [];
  const { leaves, unsafe } = flattenImport(appConfig);
  for (const [fieldPath, raw] of Object.entries(leaves)) {
    if (isConfigRecord(raw) && Object.keys(raw).length === 0) continue;
    if (secretPathForPreviewPath(fieldPath, schemaPathSet) != null) continue;
    const value = normalizeForSave(
      stripSecretPreviewValues(raw, fieldPath, schemaPathSet),
      findSchemaField(fields, fieldPath),
    );
    if (value == null) skipped.push({ fieldPath, reason: 'empty' });
    else entries.push({ fieldPath, value });
  }
  for (const { path, key } of unsafe) skipped.push({ fieldPath: path, reason: 'unsafeKey', key });
  return { entries, skipped };
}

/** The MCP server a path belongs to when that server is process-backed (stdio: command/args/env). */
function processServerOf(path: string, appConfig: t.ConfigRecord): string | undefined {
  const [section, name] = path.split('.');
  if (section !== 'mcpServers' || name == null) return undefined;
  const servers = appConfig.mcpServers ?? appConfig.mcpConfig;
  const server = isConfigRecord(servers) ? servers[name] : undefined;
  return isProcessMCPServerConfig(server) ? `mcpServers.${name}` : undefined;
}

/**
 * Why an imported leaf is left out, checked in the order the save pipeline
 * would: sections and fields the panel never writes first (so a dotted key
 * inside an Azure group, which is skipped anyway, does not block the import),
 * then keys the admin API can't store.
 */
function skipReasonOf(
  path: string,
  value: t.ConfigValue,
  isScope: boolean,
): t.ImportSkipReason | null {
  const reason = getWriteSkipReason(path, false) ?? (isScope ? scopeGateSkipReason(path) : null);
  if (reason) return reason;
  if (findYamlManagedValues(path, value).length > 0) return 'yamlOnly';
  if (findUnsafeKeys(value, path).length > 0) return 'unsafeKey';
  return null;
}

/**
 * What an import writes (WS7, D4 merge semantics): every leaf of the YAML
 * that can be written, and every other leaf with the reason it is left out
 * (role permissions, librechat.yaml-only and base-only sections, sections a
 * profile can't set, keys the admin API can't store, process-backed MCP
 * servers, empty values). Leaves
 * the bundled schema does not describe are imported as-is and flagged.
 */
export function planImport(
  appConfig: t.ConfigRecord,
  fields: t.SchemaField[],
  schemaPathSet: ReadonlySet<string>,
  isScope = false,
): t.ImportPlan {
  const collected = collectImportEntries(appConfig, fields, schemaPathSet);
  const entries: t.SaveEntry[] = [];
  const skipped: t.ImportSkippedKey[] = [];
  const unknown = new Set<string>();
  const processServers = new Set<string>();

  for (const entry of collected.entries) {
    const server = processServerOf(entry.fieldPath, appConfig);
    if (server) {
      if (!processServers.has(server)) skipped.push({ fieldPath: server, reason: 'processMcp' });
      processServers.add(server);
      continue;
    }
    const reason = skipReasonOf(entry.fieldPath, entry.value, isScope);
    if (reason) {
      skipped.push({ fieldPath: entry.fieldPath, reason });
      continue;
    }
    if (resolveSubSchema(configSchema as t.ZodSchemaLike, entry.fieldPath.split('.')) == null) {
      unknown.add(entry.fieldPath);
    }
    entries.push(entry);
  }

  for (const skip of collected.skipped) {
    const server = processServerOf(skip.fieldPath, appConfig);
    if (server && processServers.has(server)) continue;
    const holderReason =
      skip.reason === 'unsafeKey' && skip.fieldPath
        ? getWriteSkipReason(skip.fieldPath, false)
        : null;
    skipped.push(holderReason ? { fieldPath: skip.fieldPath, reason: holderReason } : skip);
  }

  return { entries, skipped, unknown };
}
