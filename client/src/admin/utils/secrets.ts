import type * as t from '~/admin/types';
import { SECRET_CONFIG_KEYS } from '~/admin/constants';
import { getValueAtPath } from './format';

const PREVIEW_KEY_RE = /^(.+)Preview$/;
const SECRET_LIKE_KEY_RE = /(api_?key|secret_?key|secret)$/i;

/** Whether a key names a secret: a known one (`apiKey`, `client_secret`) or one that reads like it (`tavilyApiKey`). */
export function isSecretKey(key: string): boolean {
  return SECRET_CONFIG_KEYS.has(key) || SECRET_LIKE_KEY_RE.test(key);
}
const ARRAY_INDEX_SEGMENT_RE = /\.\d+(?=\.|$)/g;

function secretKeyForPreviewKey(key: string): string | null {
  const match = PREVIEW_KEY_RE.exec(key);
  if (!match) return null;
  return match[1];
}

/**
 * Strips numeric array-index segments (`endpoints.custom.0.apiKey` →
 * `endpoints.custom.apiKey`) so an edited array entry's path matches the
 * schema's index-free field paths.
 */
function stripArrayIndices(path: string): string {
  return path.replace(ARRAY_INDEX_SEGMENT_RE, '');
}

/** Masked-preview companion key for a secret field key (`apiKey` → `apiKeyPreview`). */
export function toSecretPreviewKey(key: string): string {
  return `${key}Preview`;
}

/**
 * Masked preview value (e.g. `sk-mist...4321`) for a redacted secret field,
 * read from the sibling preview companion the backend returns when a secret
 * is set. Returns undefined when the field has no set-and-hidden secret.
 */
export function getSecretPreviewValue(parentValue: t.ConfigValue, key: string): string | undefined {
  if (!parentValue || typeof parentValue !== 'object' || Array.isArray(parentValue)) {
    return undefined;
  }
  const sibling = (parentValue as Record<string, t.ConfigValue>)[toSecretPreviewKey(key)];
  return typeof sibling === 'string' && sibling !== '' ? sibling : undefined;
}

/**
 * The value at `path`, else the masked preview of a secret the admin API
 * redacts there (`webSearch.tavilyApiKey` → `tavilyApiKeyPreview`), so a
 * stored secret reads as set: removing it is a real change.
 */
export function valueOrSecretPreview(root: t.ConfigValue, path: string): t.ConfigValue {
  const value = getValueAtPath(root, path);
  if (value !== undefined) return value;
  const dot = path.lastIndexOf('.');
  const parent = dot === -1 ? root : getValueAtPath(root, path.slice(0, dot));
  return getSecretPreviewValue(parent, path.slice(dot + 1));
}

/**
 * Real secret path for a preview companion path (`ocr.apiKeyPreview` →
 * `ocr.apiKey`). Anchored to known schema leaf paths so dynamic record keys
 * that merely look preview-shaped never match.
 */
export function secretPathForPreviewPath(
  path: string,
  schemaPaths: ReadonlySet<string>,
): string | null {
  const lastDot = path.lastIndexOf('.');
  const realKey = secretKeyForPreviewKey(lastDot === -1 ? path : path.slice(lastDot + 1));
  if (!realKey) return null;
  const realPath = lastDot === -1 ? realKey : `${path.slice(0, lastDot + 1)}${realKey}`;
  return schemaPaths.has(stripArrayIndices(realPath)) ? realPath : null;
}

/**
 * Replaces preview companion paths with their real secret paths so a redacted
 * secret still counts as configured/overridden for indicator and reset logic.
 */
export function mapSecretPreviewPaths(
  paths: Iterable<string>,
  schemaPaths: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>();
  for (const path of paths) {
    result.add(secretPathForPreviewPath(path, schemaPaths) ?? path);
  }
  return result;
}

/**
 * Deep-removes preview companion strings from a value before submission. The
 * backend rejects writes to preview paths, and a masked preview value must
 * never round-trip as if it were a real secret.
 */
export function stripSecretPreviewValues(
  value: t.ConfigValue,
  basePath: string,
  schemaPaths: ReadonlySet<string>,
): t.ConfigValue {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSecretPreviewValues(entry, basePath, schemaPaths));
  }
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, t.ConfigValue> = {};
  for (const [key, child] of Object.entries(value as Record<string, t.ConfigValue>)) {
    const childPath = basePath ? `${basePath}.${key}` : key;
    if (typeof child === 'string' && secretPathForPreviewPath(childPath, schemaPaths) != null) {
      continue;
    }
    result[key] = stripSecretPreviewValues(child, childPath, schemaPaths);
  }
  return result;
}

/**
 * Drops schema fields that are preview companions of a sibling secret field
 * (`apiKeyPreview` next to `apiKey`) so they never render as editable inputs.
 * Operates on a single field level; extraction applies it per level.
 */
export function filterSecretPreviewFields(fields: t.SchemaField[]): t.SchemaField[] {
  const keys = new Set(fields.map((f) => f.key));
  return fields.filter((field) => {
    if (field.type !== 'string') return true;
    const realKey = secretKeyForPreviewKey(field.key);
    return realKey == null || !keys.has(realKey);
  });
}

/** Shown instead of a secret value in read-only views, so it never reaches the DOM. */
export const MASKED_SECRET = '••••••••';

const ENV_REFERENCE_RE = /^\$\{[A-Za-z0-9_]+\}$/;

/** An environment reference such as `${OPENAI_API_KEY}` is not a secret and may be shown. */
export function isEnvReference(value: t.ConfigValue): boolean {
  return typeof value === 'string' && ENV_REFERENCE_RE.test(value);
}

/**
 * Copy of `value` with every non-empty string stored under a secret key
 * (`apiKey`, …) replaced by `MASKED_SECRET`. `key` is the key `value` itself
 * is stored under, so a secret leaf passed on its own is masked too.
 */
export function maskSecretValues(value: t.ConfigValue, key?: string): t.ConfigValue {
  if (typeof value === 'string') {
    return key != null && value !== '' && SECRET_CONFIG_KEYS.has(key) ? MASKED_SECRET : value;
  }
  if (Array.isArray(value)) return value.map((item) => maskSecretValues(item));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, t.ConfigValue> = {};
  for (const [childKey, child] of Object.entries(value)) {
    result[childKey] = maskSecretValues(child, childKey);
  }
  return result;
}
