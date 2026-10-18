import type * as t from '~/admin/types';
import {
  isConfigRecord,
  getValueAtPath,
  setValueAtPath,
  mergeConfigLayers,
  removeValueAtPath,
} from '~/admin/utils';

/** One request the fake admin API received. */
export interface FakeAdminRequest {
  method: string;
  path: string;
  body?: { entries?: t.SaveEntry[]; fieldPath?: string; priority?: number };
}

interface FakeDoc {
  overrides: t.ConfigRecord;
  tombstones: string[];
}

/** Replies the test wants instead of the default behaviour (return undefined to fall through). */
export type FakeAdminOverride = (
  request: FakeAdminRequest,
) => { status: number; body: unknown } | undefined;

const SECRET_KEYS = new Set(['apiKey']);

/** Secret values stored as plain references (`${ENV}`, `user_provided`). */
function isPassthrough(value: string): boolean {
  return value.startsWith('${') || value === 'user_provided';
}

/** The admin API's read redaction, reduced to the panel-relevant part: encrypted secrets are replaced by their preview. */
function redact(value: t.ConfigValue): t.ConfigValue {
  if (Array.isArray(value)) return value.map(redact);
  if (!isConfigRecord(value)) return value;
  const result: t.ConfigRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key) && typeof child === 'string' && child.startsWith('enc:')) {
      result[`${key}Preview`] = `${child.slice(4, 7)}...`;
      continue;
    }
    result[key] = redact(child);
  }
  return result;
}

/**
 * An in-memory LibreChat admin config API: per-principal override documents
 * with Mongo `$set`/`$unset` field semantics, tombstones, the merged base
 * (`/base`) and librechat.yaml alone (`/base?baseOnly=true`), plus a request
 * log and per-request overrides for injecting failures.
 */
export function createFakeAdminApi(yaml: t.ConfigRecord) {
  const docs = new Map<string, FakeDoc>();
  const requests: FakeAdminRequest[] = [];
  const strippedSections = new Set<string>();
  let override: FakeAdminOverride | undefined;

  const docKey = (principalType: string, principalId: string) =>
    `${principalType}/${decodeURIComponent(principalId)}`;

  const reply = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  function encryptSecrets(value: t.ConfigValue, existing: t.ConfigValue): t.ConfigValue {
    if (Array.isArray(value)) {
      const previous = Array.isArray(existing) ? existing : [];
      return value.map((item) => {
        const name = isConfigRecord(item) ? item.name : undefined;
        const match = previous.find((p) => isConfigRecord(p) && p.name === name);
        return encryptSecrets(item, match);
      });
    }
    if (!isConfigRecord(value)) return value;
    const result: t.ConfigRecord = {};
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('Preview')) continue;
      result[key] =
        SECRET_KEYS.has(key) && typeof child === 'string' && !isPassthrough(child)
          ? `enc:${child}`
          : encryptSecrets(child, isConfigRecord(existing) ? existing[key] : undefined);
    }
    const previous = isConfigRecord(existing) ? existing : {};
    for (const key of SECRET_KEYS) {
      if (!(key in result) && typeof previous[key] === 'string') result[key] = previous[key];
    }
    return result;
  }

  function baseMerged(): t.ConfigRecord {
    const base = docs.get(docKey('role', '__base__'));
    return mergeConfigLayers(yaml, base?.overrides ?? {}) as t.ConfigRecord;
  }

  async function fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const request: FakeAdminRequest = { method, path, body };
    requests.push(request);
    const custom = override?.(request);
    if (custom) return reply(custom.status, custom.body);

    const url = new URL(path, 'http://fake');
    if (url.pathname === '/api/admin/grants/effective') {
      return reply(200, { capabilities: ['manage:configs'] });
    }
    if (url.pathname === '/api/admin/config/base') {
      const config = url.searchParams.get('baseOnly') === 'true' ? yaml : baseMerged();
      return reply(200, { config: redact(config) });
    }
    const match = /^\/api\/admin\/config\/([^/]+)\/([^/]+)(\/fields(\/tombstone)?)?$/.exec(
      url.pathname,
    );
    if (!match) return reply(404, { error: 'Not found' });
    const [, principalType, principalId, fields, tombstone] = match;
    const key = docKey(principalType, principalId);
    const doc = docs.get(key);

    if (!fields) {
      if (!doc) return reply(404, { error: 'Config not found' });
      return reply(200, {
        config: { overrides: redact(doc.overrides), tombstones: doc.tombstones },
      });
    }
    const current = doc ?? { overrides: {}, tombstones: [] };
    if (tombstone) {
      const fieldPath = String(body?.fieldPath);
      docs.set(key, {
        overrides: removeValueAtPath(current.overrides, fieldPath),
        tombstones: [...new Set([...current.tombstones, fieldPath])],
      });
      return reply(200, { config: docs.get(key) });
    }
    if (method === 'DELETE') {
      if (!doc) return reply(404, { error: 'Config not found' });
      const fieldPath = String(url.searchParams.get('fieldPath'));
      docs.set(key, {
        overrides: removeValueAtPath(doc.overrides, fieldPath),
        tombstones: doc.tombstones.filter((p) => p !== fieldPath && !p.startsWith(`${fieldPath}.`)),
      });
      return reply(200, { config: redact(docs.get(key)!.overrides) });
    }
    let overrides = current.overrides;
    const entries = (body?.entries ?? []).filter(
      (entry: t.SaveEntry) => !strippedSections.has(entry.fieldPath.split('.')[0]),
    );
    if (entries.length === 0)
      return reply(200, { message: 'No actionable field entries provided' });
    for (const entry of entries) {
      const existing = getValueAtPath(current.overrides, entry.fieldPath);
      overrides = setValueAtPath(overrides, entry.fieldPath, encryptSecrets(entry.value, existing));
    }
    const written = (body?.entries ?? []).map((e: t.SaveEntry) => e.fieldPath);
    docs.set(key, {
      overrides,
      tombstones: current.tombstones.filter((p) => !written.includes(p)),
    });
    return reply(200, { config: { overrides: redact(overrides) } });
  }

  return {
    fetch,
    requests,
    /** Stored overrides of a principal (`role/__base__` for base), unredacted. */
    stored: (principal = 'role/__base__') => docs.get(principal)?.overrides,
    tombstones: (principal = 'role/__base__') => docs.get(principal)?.tombstones ?? [],
    seed: (principal: string, overrides: t.ConfigRecord, tombstones: string[] = []) =>
      docs.set(principal, { overrides, tombstones }),
    /** Silently drops writes to a section, as LibreChat does for base-only sections. */
    stripSection: (section: string) => strippedSections.add(section),
    setOverride: (next?: FakeAdminOverride) => {
      override = next;
    },
    /** Every write request (PATCH, DELETE, POST), in order. */
    writes: () => requests.filter((r) => r.method !== 'GET'),
  };
}
