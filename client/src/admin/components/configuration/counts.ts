import type * as t from '~/admin/types';
import { createPathIndex, isConfigRecord, getValueAtPath } from '~/admin/utils';

/** Sections whose count is their entries (the schema describes one entry, not the keys). */
const ENTRY_COUNT_SECTIONS: ReadonlySet<string> = new Set(['mcpServers']);

/** Leaf field paths of a schema tree (fields with children contribute their leaves). */
export function collectFieldPaths(fields: t.SchemaField[], prefix = ''): string[] {
  const paths: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.children && field.children.length > 0) {
      paths.push(...collectFieldPaths(field.children, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * Whether a field counts as one setting: a scalar, a list (of anything), a
 * record, or a `boolean | object` switch. Their configured paths are the field
 * itself (`modelSpecs.list`, `interface.schedules`) or entries under it
 * (`fileConfig.endpoints.agents.fileSizeLimit`), never schema child paths.
 */
export function isCountLeaf(field: t.SchemaField): boolean {
  return (
    !field.children?.length ||
    field.isArray ||
    field.type === 'record' ||
    field.type.startsWith('union(')
  );
}

interface AncestorCache {
  size: number;
  ancestors: ReadonlySet<string>;
}

const ancestorCache = new WeakMap<ReadonlySet<string>, AncestorCache>();

/** Every proper ancestor of the paths in `paths`, cached per set (rebuilt if its size changes). */
function ancestorsOf(paths: ReadonlySet<string>): ReadonlySet<string> {
  const cached = ancestorCache.get(paths);
  if (cached && cached.size === paths.size) return cached.ancestors;
  const { ancestors } = createPathIndex(paths);
  ancestorCache.set(paths, { size: paths.size, ancestors });
  return ancestors;
}

interface DescendantCache {
  size: number;
  counts: ReadonlyMap<string, number>;
}

const descendantCache = new WeakMap<ReadonlySet<string>, DescendantCache>();

/** How many paths of `paths` lie inside each proper ancestor of them, cached per set. */
function descendantCounts(paths: ReadonlySet<string>): ReadonlyMap<string, number> {
  const cached = descendantCache.get(paths);
  if (cached && cached.size === paths.size) return cached.counts;
  const counts = new Map<string, number>();
  for (const path of paths) {
    let dot = path.lastIndexOf('.');
    while (dot > 0) {
      const ancestor = path.slice(0, dot);
      counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
      dot = path.lastIndexOf('.', dot - 1);
    }
  }
  descendantCache.set(paths, { size: paths.size, counts });
  return counts;
}

/** Paths of `paths` at `path` or inside it. */
function countStoredWithin(path: string, paths: ReadonlySet<string>): number {
  return (paths.has(path) ? 1 : 0) + (descendantCounts(paths).get(path) ?? 0);
}

/**
 * A count leaf that stores one path per value it sets: a `boolean | object`
 * switch set as an object (`interface.schedules.maxPerUser`) or a record
 * (`fileConfig.endpoints.agents.fileSizeLimit`). Counting overrides, each of
 * those paths is one override, as "Revert to librechat.yaml" lists them.
 */
function storesPerPath(field: t.SchemaField): boolean {
  return (
    !field.isArray &&
    !!field.children?.length &&
    (field.type === 'record' || field.type.startsWith('union('))
  );
}

/** Returns true if `paths` contains any key that is a descendant of `path`. */
export function hasDescendant(path: string, paths?: ReadonlySet<string>): boolean {
  if (!paths || paths.size === 0) return false;
  return ancestorsOf(paths).has(path);
}

/** Whether `path` itself, or anything inside it, is configured. */
export function isPathConfigured(path: string, paths?: ReadonlySet<string>): boolean {
  if (!paths) return false;
  return paths.has(path) || hasDescendant(path, paths);
}

/**
 * Count configured vs total settings in a field tree (EV-3): the one counting
 * rule behind tab badges, section and group badges, and the configured-only
 * filter. Count leaves (`isCountLeaf`) are one setting each, configured when
 * their path or anything inside it is. A group configured as a whole (a
 * primitive where the schema has an object, e.g. `interface.schedules: true`)
 * counts as one configured setting, also when its own children are counted.
 * With `perStoredPath` (counting overrides), a switch or record set value by
 * value counts each stored path (`storesPerPath`).
 */
export function countConfigured(
  fields: t.SchemaField[],
  parentPath: string,
  configuredPaths?: ReadonlySet<string>,
  perStoredPath = false,
): { total: number; configured: number } {
  if (parentPath && configuredPaths?.has(parentPath)) return { total: 1, configured: 1 };
  let total = 0;
  let configured = 0;
  for (const f of fields) {
    const p = parentPath ? `${parentPath}.${f.key}` : f.key;
    if (!isCountLeaf(f) && !configuredPaths?.has(p)) {
      const sub = countConfigured(f.children ?? [], p, configuredPaths, perStoredPath);
      total += sub.total;
      configured += sub.configured;
      continue;
    }
    total++;
    if (!configuredPaths || !isPathConfigured(p, configuredPaths)) continue;
    configured += perStoredPath && storesPerPath(f) ? countStoredWithin(p, configuredPaths) : 1;
  }
  return { total, configured };
}

/** Entries of a record or list value (0 for anything else). */
export function countEntries(value: t.ConfigValue): number {
  if (Array.isArray(value)) return value.length;
  return isConfigRecord(value) ? Object.keys(value).length : 0;
}

/**
 * Entries of the collection at `path` that hold an override (`mcpServers.github.…`).
 * A keyed list is stored as one value, so its count comes from `listOverrideCounts`.
 */
export function countOverriddenEntries(
  path: string,
  overridePaths: ReadonlySet<string>,
  listOverrideCounts?: ReadonlyMap<string, number>,
): number {
  const listCount = listOverrideCounts?.get(path);
  if (listCount !== undefined) return listCount;
  const prefix = `${path}.`;
  const entries = new Set<string>();
  for (const overridePath of overridePaths) {
    if (!overridePath.startsWith(prefix)) continue;
    const rest = overridePath.slice(prefix.length);
    const dot = rest.indexOf('.');
    entries.add(dot === -1 ? rest : rest.slice(0, dot));
  }
  return entries.size;
}

/** Admin overrides of one section, counted like `countSection` (collections by entry). */
export function countSectionOverrides(
  section: Pick<t.ConfigSectionConfig, 'id' | 'schemaKey' | 'fields' | 'sectionField'>,
  overridePaths: ReadonlySet<string>,
  listOverrideCounts?: ReadonlyMap<string, number>,
): number {
  return (
    countEntrySectionOverrides(section, overridePaths, listOverrideCounts) ??
    countSection(section, overridePaths, null, true).configured
  );
}

/**
 * Overrides of a collection section (custom endpoints, model specs, MCP
 * servers), by entry; undefined for any other section. A profile's section
 * badges count only these: its settings already count only what it sets.
 */
export function countEntrySectionOverrides(
  section: Pick<t.ConfigSectionConfig, 'id' | 'schemaKey' | 'fields' | 'sectionField'>,
  overridePaths: ReadonlySet<string>,
  listOverrideCounts?: ReadonlyMap<string, number>,
): number | undefined {
  const key = section.schemaKey ?? section.id;
  if (ENTRY_COUNT_SECTIONS.has(section.id)) return countOverriddenEntries(key, overridePaths);
  const [only] = section.fields;
  if (section.fields.length !== 1 || !isEntryCollection(only)) return undefined;
  return countOverriddenEntries(`${key}.${only.key}`, overridePaths, listOverrideCounts);
}

/**
 * The unit an override path counts as, like the badges count it: one per MCP
 * server however many of its fields are set (`mcpServers.github`), else the path.
 */
export function overrideCountUnit(path: string): string {
  const dot = path.indexOf('.');
  if (dot < 0 || !ENTRY_COUNT_SECTIONS.has(path.slice(0, dot))) return path;
  const next = path.indexOf('.', dot + 1);
  return next < 0 ? path : path.slice(0, next);
}

/** A list or record of objects (custom endpoints, model specs, MCP servers). */
function isEntryCollection(field: t.SchemaField | undefined): field is t.SchemaField {
  if (!field?.children?.length) return false;
  return field.isArray === true || field.type === 'record';
}

/**
 * Configured vs total settings of one configuration section. Entry sections
 * (MCP servers) count their entries; a section with a single field counts it
 * as one setting.
 */
export function countSection(
  section: Pick<t.ConfigSectionConfig, 'id' | 'schemaKey' | 'fields' | 'sectionField'>,
  configuredPaths: ReadonlySet<string> | undefined,
  configValues: t.ConfigRecord | null | undefined,
  perStoredPath = false,
): t.SectionCount {
  const key = section.schemaKey ?? section.id;
  if (ENTRY_COUNT_SECTIONS.has(section.id) && configValues && isConfigRecord(configValues[key])) {
    const count = countEntries(configValues[key]);
    return { total: count, configured: count, entries: true };
  }
  const [only] = section.fields;
  if (section.fields.length === 1 && isEntryCollection(only)) {
    const count = countEntries(getValueAtPath(configValues ?? null, `${key}.${only.key}`));
    return { total: count, configured: count, entries: true };
  }
  if (section.sectionField || section.fields.length === 0) {
    return { total: 1, configured: isPathConfigured(key, configuredPaths) ? 1 : 0 };
  }
  return countConfigured(section.fields, key, configuredPaths, perStoredPath);
}

/** Include the dedicated Langfuse connection in generic configured-state UI. */
export function withLangfuseConfiguredPath(
  configuredPaths: Set<string>,
  configured: boolean,
): Set<string> {
  const paths = new Set(configuredPaths);
  if (configured) paths.add('langfuse.enabled');
  return paths;
}

/** Whether `paths` holds `path`, a descendant of it, or an ancestor of it. */
export function hasPathOverlap(path: string, paths: ReadonlySet<string>): boolean {
  if (paths.has(path) || hasDescendant(path, paths)) return true;
  let dot = path.lastIndexOf('.');
  while (dot > 0) {
    if (paths.has(path.slice(0, dot))) return true;
    dot = path.lastIndexOf('.', dot - 1);
  }
  return false;
}
