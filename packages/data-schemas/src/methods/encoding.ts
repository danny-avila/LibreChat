/**
 * Reversible object-key encoding for config overrides stored through Mongoose.
 *
 * MongoDB-compatible engines disagree about field names: MongoDB 5+ stores a dotted or
 * `$`-prefixed name inside a document but cannot address it in an update, and DocumentDB,
 * Cosmos DB and FerretDB restrict such names further. Encoding every key keeps those engines
 * from ever seeing one: `%`, `.`, `$` and NUL are percent-escaped wherever they appear in a
 * key, and nothing else changes. Values are never touched. A PostgreSQL/JSONB engine stores
 * plain JSON and needs none of this, which is why it lives in the Mongoose binding only.
 *
 * Documents written before the encoding existed carry no marker and are read verbatim, so a
 * legacy key that merely looks like an escape sequence keeps its meaning. A marked document
 * decodes only the four sequences this module emits; any other `%` is left as stored.
 */

/** Stored on a config document whose override keys are encoded. */
export const CONFIG_KEY_ENCODING_VERSION = 1;

const NUL = String.fromCharCode(0);

const ENCODED: Readonly<Record<string, string>> = {
  '%': '%25',
  '.': '%2E',
  $: '%24',
};

const DECODED: Readonly<Record<string, string>> = {
  '%25': '%',
  '%2E': '.',
  '%24': '$',
  '%00': NUL,
};

const ENCODE_PATTERN = /[%.$]/g;
const DECODE_PATTERN = /%(?:25|2E|24|00)/g;

/** `%` is escaped first, so the `%` an escape introduces is never escaped again. */
export function encodeStoredKey(key: string): string {
  const escaped = key.replace(ENCODE_PATTERN, (character) => ENCODED[character]);
  return escaped.includes(NUL) ? escaped.split(NUL).join('%00') : escaped;
}

export function decodeStoredKey(key: string): string {
  return key.includes('%') ? key.replace(DECODE_PATTERN, (sequence) => DECODED[sequence]) : key;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Rewrites every key of every plain object below `value`, keeping JSON semantics: an
 * `undefined` property is dropped and an `undefined` array element becomes `null`. Containers
 * nothing changed in are returned as they are.
 */
function mapKeys(value: unknown, mapKey: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const mapped = item === undefined ? null : mapKeys(item, mapKey);
      changed ||= mapped !== item;
      return mapped;
    });
    return changed ? next : value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  let changed = false;
  const entries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      changed = true;
      continue;
    }
    const nextKey = mapKey(key);
    const nextChild = mapKeys(child, mapKey);
    changed ||= nextKey !== key || nextChild !== child;
    entries.push([nextKey, nextChild]);
  }
  return changed ? Object.fromEntries(entries) : value;
}

/** Encodes every key below `value` for storage. */
export function encodeStoredKeys<T>(value: T): T {
  return mapKeys(value, encodeStoredKey) as T;
}

/** Decodes every key below `value` that {@link encodeStoredKeys} wrote. */
export function decodeStoredKeys<T>(value: T): T {
  return mapKeys(value, decodeStoredKey) as T;
}
