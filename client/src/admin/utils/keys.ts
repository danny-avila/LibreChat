import type * as t from '~/admin/types';

const UNSAFE_KEY_RE = /^\$|\./;

/** Record keys the admin API cannot store: containing `.` or starting with `$`. */
export function isUnsafeConfigKey(key: string): boolean {
  return UNSAFE_KEY_RE.test(key);
}

function isKeyValuePairList(value: t.ConfigValue[]): value is t.KeyValuePair[] {
  const first = value[0];
  return (
    first != null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    'key' in first &&
    'value' in first
  );
}

/**
 * Every object key (or key/value-pair key) under `value` that the admin API
 * would silently drop, with the dot-path of the object that holds it.
 */
export function findUnsafeKeys(value: t.ConfigValue, basePath: string): t.UnsafeConfigKey[] {
  if (value == null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    if (isKeyValuePairList(value)) {
      return value
        .filter((pair) => typeof pair.key === 'string' && isUnsafeConfigKey(pair.key))
        .map((pair) => ({ path: basePath, key: pair.key }));
    }
    return value.flatMap((item, index) => findUnsafeKeys(item, `${basePath}.${index}`));
  }
  const found: t.UnsafeConfigKey[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (isUnsafeConfigKey(key)) found.push({ path: basePath, key });
    found.push(...findUnsafeKeys(child, basePath ? `${basePath}.${key}` : key));
  }
  return found;
}

/** Text with nothing but whitespace (or nothing at all): not a value LibreChat can use. */
export function isBlankText(value: string): boolean {
  return value.trim() === '';
}

/** Whether typed text is a value: not blank, or (`keepsWhitespace`, a stop sequence) not empty. */
export function isFilledText(value: string, keepsWhitespace = false): boolean {
  return keepsWhitespace ? value !== '' : !isBlankText(value);
}

/** Keys whose text keeps its whitespace as the value: stop sequences (`"\n"`, `"\n\n"`). */
const WHITESPACE_SIGNIFICANT_KEYS: ReadonlySet<string> = new Set(['stop']);

/** Whether text at `path` is whitespace-significant: a `stop` value, or an item of a `stop` list. */
export function isWhitespaceSignificantPath(path: string): boolean {
  const segments = path.split('.');
  let last = segments.length - 1;
  while (last > 0 && /^\d+$/.test(segments[last])) last--;
  return WHITESPACE_SIGNIFICANT_KEYS.has(segments[last]);
}

function blankPairs(pairs: t.KeyValuePair[], basePath: string): t.BlankConfigText[] {
  return pairs.flatMap((pair): t.BlankConfigText[] => {
    if (typeof pair.key === 'string' && isBlankText(pair.key)) {
      return [{ path: basePath, key: pair.key }];
    }
    const valuePath = `${basePath}.${pair.key}`;
    if (typeof pair.value !== 'string' || pair.value === '' || !isBlankText(pair.value)) return [];
    return isWhitespaceSignificantPath(valuePath) ? [] : [{ path: valuePath }];
  });
}

/**
 * Whitespace-only strings and object keys under `value`: LibreChat would
 * store them and read them as values (a Base URL of `"   "`, a header named
 * `"  "`). A blank key reports the path of the object holding it; a blank
 * string, its own path. Stop sequences keep their whitespace and pass.
 */
export function findBlankText(value: t.ConfigValue, basePath: string): t.BlankConfigText[] {
  if (typeof value === 'string') {
    if (value === '' || !isBlankText(value) || isWhitespaceSignificantPath(basePath)) return [];
    return [{ path: basePath }];
  }
  if (value == null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    if (isKeyValuePairList(value)) return blankPairs(value, basePath);
    return value.flatMap((item, index) => findBlankText(item, `${basePath}.${index}`));
  }
  return Object.entries(value).flatMap(([key, child]) => {
    if (isBlankText(key)) return [{ path: basePath, key }];
    return findBlankText(child, basePath ? `${basePath}.${key}` : key);
  });
}
