import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { APP_SERVICE_KEY_ALIASES } from '~/admin/constants';
import { resolveSubSchema } from './schema';
import { isUnsafeConfigKey } from './keys';
import { isConfigRecord } from './format';

/** Top-level YAML keys that describe the file itself rather than a setting. */
const IMPORT_METADATA_KEYS = new Set(['version']);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Leaves of `value` by dot-path, like `flattenObject`, except that a key the
 * admin API can't store (containing `.` or starting with `$`) is never split
 * into a nested path: it is reported in `unsafe` and its value is left out.
 */
function collectLeaves(value: t.ConfigRecord, prefix: string, out: t.ImportLeaves): void {
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (isUnsafeConfigKey(key)) {
      out.unsafe.push({ path: prefix, key });
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    if (isConfigRecord(child) && Object.keys(child).length > 0) collectLeaves(child, path, out);
    else out.leaves[path] = child;
  }
}

/**
 * Leaves of an imported YAML keyed by canonical dot-path. AppService alias
 * sections (`interfaceConfig`) are merged with their canonical section
 * (`interface`) leaf by leaf, the canonical spelling winning on conflicts.
 */
export function flattenImport(appConfig: t.ConfigRecord): t.ImportLeaves {
  const aliased: t.ConfigRecord = {};
  const canonical: t.ConfigRecord = {};
  for (const [key, value] of Object.entries(appConfig)) {
    if (IMPORT_METADATA_KEYS.has(key)) continue;
    const alias = APP_SERVICE_KEY_ALIASES[key];
    if (alias) aliased[alias] = value;
    else canonical[key] = value;
  }
  const fromAlias: t.ImportLeaves = { leaves: {}, unsafe: [] };
  const fromCanonical: t.ImportLeaves = { leaves: {}, unsafe: [] };
  collectLeaves(aliased, '', fromAlias);
  collectLeaves(canonical, '', fromCanonical);
  return {
    leaves: { ...fromAlias.leaves, ...fromCanonical.leaves },
    unsafe: [...fromAlias.unsafe, ...fromCanonical.unsafe],
  };
}

/** Leaf paths of an imported YAML the bundled config schema does not describe (aliases resolved). */
export function findUnknownImportPaths(appConfig: t.ConfigRecord): string[] {
  return Object.keys(flattenImport(appConfig).leaves).filter(
    (path) => resolveSubSchema(configSchema as t.ZodSchemaLike, path.split('.')) == null,
  );
}
