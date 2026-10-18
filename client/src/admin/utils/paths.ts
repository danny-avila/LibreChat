import type * as t from '~/admin/types';
import { isConfigRecord } from './format';

const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function collectInto(value: t.ConfigRecord, prefix: string, out: string[]): void {
  for (const key of Object.keys(value)) {
    if (UNSAFE_SEGMENTS.has(key)) continue;
    const child = value[key];
    if (child === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isConfigRecord(child)) {
      collectInto(child, path, out);
    } else {
      out.push(path);
    }
  }
}

/**
 * Leaf paths a config tree sets: arrays, primitives and `null` are leaves, and
 * an empty object sets nothing (LibreChat leaves `{}` behind when the last
 * override under a section is removed, and it must not count as a setting).
 */
export function collectLeafPaths(value: t.ConfigValue, prefix = ''): string[] {
  if (!isConfigRecord(value)) return value === undefined || !prefix ? [] : [prefix];
  const out: string[] = [];
  collectInto(value, prefix, out);
  return out;
}

/** Indexes leaf paths so exact, descendant and ancestor lookups cost O(depth). */
export function createPathIndex(paths: Iterable<string>): t.PathIndex {
  const set = new Set<string>();
  const ancestors = new Set<string>();
  for (const path of paths) {
    set.add(path);
    let dot = path.lastIndexOf('.');
    while (dot > 0) {
      const ancestor = path.slice(0, dot);
      if (ancestors.has(ancestor)) break;
      ancestors.add(ancestor);
      dot = ancestor.lastIndexOf('.');
    }
  }
  return { paths: set, ancestors };
}

/** Whether `paths` holds `path` itself or one of its ancestors (the value at `path` comes from it). */
export function hasPathOrAncestor(paths: ReadonlySet<string>, path: string): boolean {
  if (paths.size === 0) return false;
  if (paths.has(path)) return true;
  let dot = path.lastIndexOf('.');
  while (dot > 0) {
    if (paths.has(path.slice(0, dot))) return true;
    dot = path.lastIndexOf('.', dot - 1);
  }
  return false;
}

/** Whether the index sets `path`, something inside it, or a leaf that contains it. */
export function pathIndexOverlaps(index: t.PathIndex, path: string): boolean {
  return index.ancestors.has(path) || hasPathOrAncestor(index.paths, path);
}

/**
 * Whether a row at `path` stays visible under the tab filter (`filter`, the
 * matching paths; null when none is applied): it matches, sits inside a match
 * (a matching group or entry shows all its rows), or holds one.
 */
export function isRowVisible(filter: t.PathIndex | null, path: string): boolean {
  return filter == null || pathIndexOverlaps(filter, path);
}

/** Whether the tab filter matched `path` itself or something inside it, so its group or card opens. */
export function holdsFilterMatch(filter: t.PathIndex | null, path: string): boolean {
  return filter != null && (filter.paths.has(path) || filter.ancestors.has(path));
}
