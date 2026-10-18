import type * as t from '~/admin/types';

export const REQUIRED_BY_TRANSPORT: Record<string, Set<string>> = {
  stdio: new Set(['command', 'args']),
  sse: new Set(['url']),
  'streamable-http': new Set(['url']),
  http: new Set(['url']),
  websocket: new Set(['url']),
};

/**
 * YAML configs can omit `type` because each transport schema (except
 * streamable-http) defaults from the discriminating fields. Mirror the
 * backend's Zod union resolution order so the UI shows the effective type.
 */
export function inferTransportType(values: Record<string, t.ConfigValue>): string {
  if (typeof values.type === 'string' && values.type) return values.type;
  if (typeof values.command === 'string' && values.command) return 'stdio';
  if (typeof values.url === 'string' && values.url) {
    try {
      const protocol = new URL(values.url).protocol;
      if (protocol === 'ws:' || protocol === 'wss:') return 'websocket';
    } catch {
      /* fall through */
    }
    return 'sse';
  }
  return '';
}

export function setLeaf(
  target: Record<string, t.ConfigValue>,
  segments: string[],
  value: t.ConfigValue,
): void {
  let cursor: Record<string, t.ConfigValue> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!isPlainObject(cursor[seg])) cursor[seg] = {};
    cursor = cursor[seg] as Record<string, t.ConfigValue>;
  }
  const leaf = segments[segments.length - 1];
  if (value === undefined) delete cursor[leaf];
  else cursor[leaf] = value;
}

export function deepClone(value: Record<string, t.ConfigValue>): Record<string, t.ConfigValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, t.ConfigValue>;
}

export function isPlainObject(value: t.ConfigValue): value is Record<string, t.ConfigValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** New entry names are blocked from containing dots, but legacy data may still hold dotted server names; longest-prefix match against known keys keeps those edits attributed to the real entry instead of carving off the first segment. */
export function resolveEntryKey(
  rest: string,
  knownKeys: Iterable<string>,
): { entryKey: string; segments: string[] } | null {
  if (rest === '') return null;
  let best: string | null = null;
  for (const key of knownKeys) {
    if (rest === key || rest.startsWith(`${key}.`)) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  if (best !== null) {
    const remainder = rest.length > best.length ? rest.slice(best.length + 1) : '';
    return { entryKey: best, segments: remainder === '' ? [] : remainder.split('.') };
  }
  const dotIdx = rest.indexOf('.');
  if (dotIdx === -1) return { entryKey: rest, segments: [] };
  return { entryKey: rest.slice(0, dotIdx), segments: rest.slice(dotIdx + 1).split('.') };
}

function lookupLeaf(obj: unknown, segments: string[]): t.ConfigValue | undefined {
  let cursor: unknown = obj;
  for (const seg of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor as t.ConfigValue | undefined;
}

/** Merges leaf edits onto the baseline MCP entries (omitting deleted entries) so callers can validate the post-save state. `resetFallback`, when provided, supplies the value that an `undefined` leaf write would reveal after the actual save (e.g. in scope mode, a leaf reset removes the scope override and exposes the inherited base value). */
function mergeMcpEdits(
  baseline: Record<string, t.ConfigValue>,
  edits: Array<[string, t.ConfigValue]>,
  resetFallback?: Record<string, t.ConfigValue>,
): Record<string, t.ConfigValue> {
  const baseEntries: Record<string, Record<string, t.ConfigValue>> = {};
  for (const [k, v] of Object.entries(baseline)) {
    if (isPlainObject(v)) baseEntries[k] = JSON.parse(JSON.stringify(v));
  }
  const knownKeys = new Set(Object.keys(baseEntries));
  const deletedEntries = new Set<string>();
  const upsertEntries: Record<string, Record<string, t.ConfigValue>> = {};

  for (const [path, value] of edits) {
    if (!path.startsWith('mcpServers.')) continue;
    const parsed = resolveEntryKey(path.slice('mcpServers.'.length), knownKeys);
    if (!parsed) continue;
    const { entryKey, segments } = parsed;
    knownKeys.add(entryKey);
    if (segments.length === 0) {
      if (value === undefined) {
        const fallback = resetFallback?.[entryKey];
        if (isPlainObject(fallback)) {
          upsertEntries[entryKey] = JSON.parse(JSON.stringify(fallback));
          deletedEntries.delete(entryKey);
        } else {
          deletedEntries.add(entryKey);
          delete upsertEntries[entryKey];
          delete baseEntries[entryKey];
        }
      } else if (isPlainObject(value)) {
        upsertEntries[entryKey] = JSON.parse(JSON.stringify(value));
        deletedEntries.delete(entryKey);
      }
      continue;
    }
    if (deletedEntries.has(entryKey) && value !== undefined) {
      deletedEntries.delete(entryKey);
    }
    if (!upsertEntries[entryKey]) {
      /** Clone on promote so subsequent setLeaf mutations don't bleed into baseEntries; the assembly loop relies on baseEntries staying intact for entries that never received an upsert. */
      const seed = baseEntries[entryKey];
      upsertEntries[entryKey] = seed ? deepClone(seed) : {};
    }
    if (value === undefined && resetFallback) {
      const inherited = lookupLeaf(resetFallback[entryKey], segments);
      setLeaf(upsertEntries[entryKey], segments, inherited as t.ConfigValue);
    } else {
      setLeaf(upsertEntries[entryKey], segments, value);
    }
  }

  const result: Record<string, t.ConfigValue> = {};
  for (const [k, v] of Object.entries(baseEntries)) {
    if (deletedEntries.has(k)) continue;
    if (k in upsertEntries) continue;
    result[k] = v;
  }
  for (const [k, v] of Object.entries(upsertEntries)) {
    if (deletedEntries.has(k)) continue;
    result[k] = v;
  }
  return result;
}

/** Returns a list of validation errors for affected MCP entries after applying edits, so the save flow can block invalid transport-state combinations the per-leaf PATCH cannot catch. `resetFallback` is the inherited baseline (e.g. base config in scope mode) whose values get revealed when a scope reset removes an override. */
export function validateMcpCrossField(
  baseline: Record<string, t.ConfigValue>,
  edits: Array<[string, t.ConfigValue]>,
  resetFallback?: Record<string, t.ConfigValue>,
): Array<{ entryKey: string; missingField: string }> {
  const merged = mergeMcpEdits(baseline, edits, resetFallback);
  const knownKeys = new Set(Object.keys(baseline));
  const affected = new Set<string>();
  for (const [path] of edits) {
    if (!path.startsWith('mcpServers.')) continue;
    const parsed = resolveEntryKey(path.slice('mcpServers.'.length), knownKeys);
    if (parsed) {
      knownKeys.add(parsed.entryKey);
      affected.add(parsed.entryKey);
    }
  }
  const errors: Array<{ entryKey: string; missingField: string }> = [];
  for (const entryKey of affected) {
    const entry = merged[entryKey];
    if (!isPlainObject(entry)) continue;
    const rawType = typeof entry.type === 'string' ? entry.type : '';
    /** When the user clears the field that was inferring transport on an inferred-stdio entry (no explicit `type`), `inferTransportType(entry)` collapses to '' and the validator would skip required-field checks. Fall back to the baseline's inference so a stdio-by-default server still trips the missing-command check after its discriminator gets cleared. */
    const baselineEntry = isPlainObject(baseline[entryKey])
      ? (baseline[entryKey] as Record<string, t.ConfigValue>)
      : null;
    const transportType =
      rawType ||
      inferTransportType(entry) ||
      (baselineEntry ? inferTransportType(baselineEntry) : '');
    const normalized = transportType === 'http' ? 'streamable-http' : transportType;
    const required = REQUIRED_BY_TRANSPORT[normalized];
    if (!required) continue;
    for (const field of required) {
      const v = entry[field];
      /** Empty array is a valid Zod value for required array fields like stdio `args` (the schema requires presence, not non-empty). Don't flag it as missing. */
      const missing = v === undefined || v === null || v === '';
      if (missing) {
        errors.push({ entryKey, missingField: field });
        break;
      }
    }
  }
  return errors;
}
