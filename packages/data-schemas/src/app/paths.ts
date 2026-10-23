/**
 * Segment addressing inside a config overrides document.
 *
 * A path is a list of keys, so a record key that contains a dot is still one segment. A dotted
 * `fieldPath` is an edge format: `parseFieldPath` splits it, which is lossless only when no key
 * on the path contains a dot. Tombstones are stored as dotted strings, so they can only name
 * paths whose segments contain no dots.
 *
 * Every helper is pure: it never mutates its input and copies only the containers along the
 * path it changes.
 */

export type ConfigPathSegments = readonly string[];

type JsonRecord = { [key: string]: unknown };

/** Why a path cannot be applied to the document it was addressed against. */
export type ConfigPathErrorReason =
  /** The path has no segments, or a segment is empty. */
  | 'empty_path'
  /** The path continues below a value that is neither an object nor an array. */
  | 'scalar_parent'
  /** The path names a key inside an array; arrays are addressed by index only. */
  | 'array_key'
  /** The path names an array index past the end; a write may only replace or append one. */
  | 'array_index'
  /** The path ends on an array element, which a removal would leave as `null`. */
  | 'array_element'
  /** A tombstone names an array element or a path inside one; only whole arrays can be hidden. */
  | 'inside_array'
  /** A tombstone (or another dotted-path consumer) would have to split a segment with a dot. */
  | 'dotted_segment'
  /** A segment starts with `$` or names a reserved key (`__*`, `constructor`, `prototype`). */
  | 'unsafe_segment'
  /** The path is longer than {@link MAX_CONFIG_PATH_DEPTH} segments. */
  | 'too_deep';

/** The deepest path a client may address; config schemas nest far less than this. */
export const MAX_CONFIG_PATH_DEPTH = 32;

const UNSAFE_SEGMENT = /^(?:\$|__)|^(?:constructor|prototype)$/;

/**
 * A path that cannot be applied to the document as stored. The message never echoes the path,
 * which can carry submitted keys; callers that report it use `code` and `reason`.
 */
export class ConfigPathError extends Error {
  readonly code = 'CONFIG_PATH_INVALID';

  constructor(
    readonly segments: string[],
    readonly reason: ConfigPathErrorReason,
  ) {
    super(`Config path cannot be applied: ${reason}`);
    this.name = 'ConfigPathError';
  }
}

export function isConfigPathError(error: unknown): error is ConfigPathError {
  return (
    error instanceof ConfigPathError ||
    (error instanceof Error && (error as { code?: unknown }).code === 'CONFIG_PATH_INVALID')
  );
}

export function isPlainRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(target: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isArrayIndex(segment: string): boolean {
  return /^(?:0|[1-9]\d*)$/.test(segment);
}

function assertSegments(segments: ConfigPathSegments): void {
  if (segments.length === 0 || segments.some((segment) => segment === '')) {
    throw new ConfigPathError([...segments], 'empty_path');
  }
}

/** Splits a dotted field path into segments. Lossless only for keys that contain no dot. */
export function parseFieldPath(fieldPath: string): string[] {
  return fieldPath.split('.');
}

/**
 * Validates a client-supplied segment path: 1 to {@link MAX_CONFIG_PATH_DEPTH} non-empty
 * strings, none starting with `$` or naming a reserved key. A segment may contain dots, which
 * is what segments are for: addressing a record key such as `us.anthropic.claude-sonnet-4-5`.
 */
export function parseConfigPathSegments(
  value: unknown,
): { ok: true; segments: string[] } | { ok: false; reason: ConfigPathErrorReason } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: 'empty_path' };
  }
  if (value.length > MAX_CONFIG_PATH_DEPTH) {
    return { ok: false, reason: 'too_deep' };
  }
  for (const segment of value) {
    if (typeof segment !== 'string' || segment === '') {
      return { ok: false, reason: 'empty_path' };
    }
    if (UNSAFE_SEGMENT.test(segment)) {
      return { ok: false, reason: 'unsafe_segment' };
    }
  }
  return { ok: true, segments: [...(value as string[])] };
}

/** Whether a segment path can be written as a dotted field path without losing a key. */
export function isDotFreePath(segments: ConfigPathSegments): boolean {
  return segments.every((segment) => !segment.includes('.'));
}

/** Joins segments into the dotted form tombstones are stored in. */
export function formatTombstonePath(segments: ConfigPathSegments): string {
  assertSegments(segments);
  if (!isDotFreePath(segments)) {
    throw new ConfigPathError([...segments], 'dotted_segment');
  }
  return segments.join('.');
}

/** Whether `prefix` addresses `segments` itself or one of its ancestors. */
export function isSegmentPrefix(prefix: ConfigPathSegments, segments: ConfigPathSegments): boolean {
  return (
    prefix.length <= segments.length &&
    prefix.every((segment, index) => segment === segments[index])
  );
}

/** Whether a stored tombstone names `segments` itself or a path below it. */
export function isTombstoneAtOrBelow(tombstone: string, segments: ConfigPathSegments): boolean {
  return isSegmentPrefix(segments, parseFieldPath(tombstone));
}

export function getAtPath(root: unknown, segments: ConfigPathSegments): unknown {
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current) && isArrayIndex(segment)) {
      current = current[Number(segment)];
    } else if (isPlainRecord(current) && hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function setInto(
  container: unknown,
  segments: ConfigPathSegments,
  depth: number,
  value: unknown,
): unknown {
  if (depth === segments.length) {
    return value;
  }
  const segment = segments[depth];
  if (Array.isArray(container)) {
    if (!isArrayIndex(segment)) {
      throw new ConfigPathError(segments.slice(0, depth + 1), 'array_key');
    }
    const index = Number(segment);
    if (index > container.length) {
      throw new ConfigPathError(segments.slice(0, depth + 1), 'array_index');
    }
    const next: unknown[] = [...container];
    next[index] = setInto(next[index], segments, depth + 1, value);
    return next;
  }
  if (container !== undefined && !isPlainRecord(container)) {
    throw new ConfigPathError(segments.slice(0, depth), 'scalar_parent');
  }
  const next: JsonRecord = { ...(container ?? {}) };
  const child = hasOwn(next, segment) ? next[segment] : undefined;
  /** Defined rather than assigned, so a `__proto__` key stays data instead of a prototype. */
  Object.defineProperty(next, segment, {
    value: setInto(child, segments, depth + 1, value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return next;
}

/**
 * Sets `value` at `segments` the way a document store's field set does: missing objects on the
 * way are created and array elements are addressed by index. A path that continues below a
 * scalar, `null`, or a named key of an array is refused instead of silently replacing what is
 * there, and so is an index past the end of an array: an element can be replaced or appended,
 * never reached by padding the array with `null`, so the size of a write is bounded by the
 * document it lands on rather than by a number in the path.
 */
export function setAtPath(
  root: JsonRecord,
  segments: ConfigPathSegments,
  value: unknown,
): JsonRecord {
  assertSegments(segments);
  return setInto(root, segments, 0, value) as JsonRecord;
}

function removeFrom(container: unknown, segments: ConfigPathSegments, depth: number): unknown {
  const segment = segments[depth];
  const isLast = depth === segments.length - 1;
  if (Array.isArray(container)) {
    if (!isArrayIndex(segment) || Number(segment) >= container.length) {
      return container;
    }
    if (isLast) {
      throw new ConfigPathError([...segments], 'array_element');
    }
    const index = Number(segment);
    const child = removeFrom(container[index], segments, depth + 1);
    if (child === container[index]) {
      return container;
    }
    const next = [...container];
    next[index] = child;
    return next;
  }
  if (!isPlainRecord(container) || !hasOwn(container, segment)) {
    return container;
  }
  if (isLast) {
    const next = { ...container };
    delete next[segment];
    return next;
  }
  const child = removeFrom(container[segment], segments, depth + 1);
  if (child === container[segment]) {
    return container;
  }
  return { ...container, [segment]: child };
}

/**
 * Removes the value at `segments`. A missing path is a no-op (the input is returned as is). A
 * path ending on an existing array element is refused: removing it would either shift the
 * elements after it or leave a `null` hole, and arrays are written whole.
 */
export function unsetAtPath(root: JsonRecord, segments: ConfigPathSegments): JsonRecord {
  assertSegments(segments);
  return removeFrom(root, segments, 0) as JsonRecord;
}

function isEmptyRecord(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0;
}

/**
 * Removes the objects on the way to `segments` that hold nothing, deepest first, so a removed
 * leaf does not leave `{}` shells behind. It stops at the first ancestor that still holds a
 * value, at an array (an element is never removed), and at the document root, which stays.
 */
export function pruneEmptyAncestors(root: JsonRecord, segments: ConfigPathSegments): JsonRecord {
  let result = root;
  for (let depth = segments.length - 1; depth >= 1; depth--) {
    const ancestor = segments.slice(0, depth);
    if (!isEmptyRecord(getAtPath(result, ancestor))) {
      break;
    }
    if (!isPlainRecord(getAtPath(result, ancestor.slice(0, -1)))) {
      break;
    }
    result = removeFrom(result, ancestor, 0) as JsonRecord;
  }
  return result;
}

/** Whether `value` is an object that holds only objects that hold nothing (`{}`, `{ a: {} }`). */
export function isEffectivelyEmpty(value: unknown): boolean {
  return isPlainRecord(value) && Object.values(value).every(isEffectivelyEmpty);
}

/**
 * The stored tombstones a field write at `segments` clears: the written path and its ancestors
 * below the section, so a whole-section tombstone survives a nested write. Only the dot-free
 * prefix of the path can match a tombstone.
 */
export function getClearedTombstones(segments: ConfigPathSegments): string[] {
  const dotted = segments.findIndex((segment) => segment.includes('.'));
  const addressable = dotted === -1 ? segments : segments.slice(0, dotted);
  if (addressable.length === 0) {
    return [];
  }
  if (segments.length === 1) {
    return [addressable[0]];
  }
  const paths: string[] = [];
  for (let length = 2; length <= addressable.length; length++) {
    paths.push(addressable.slice(0, length).join('.'));
  }
  return paths;
}

/** {@link getClearedTombstones} for a dotted field path. */
export function getTombstonePathsToClear(fieldPath: string): string[] {
  return getClearedTombstones(parseFieldPath(fieldPath));
}
