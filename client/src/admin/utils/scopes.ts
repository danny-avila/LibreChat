import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { KEYED_COLLECTIONS, getScopeGateReason } from '~/admin/constants';
import { flattenObject, getValueAtPath } from './format';
import { getEntryKey } from './collections';

/** The skip reason a save in a profile gets when its section is gated (`getScopeGateReason`). */
const GATE_SKIP_REASONS: Readonly<Record<t.ScopeGateReason, t.SkipReason>> = {
  baseOnly: 'baseOnly',
  yamlOnly: 'yamlOnly',
  tenantWide: 'dedicated',
  preAuth: 'baseScope',
};

/** Profile kinds a user can only belong to once, so two of them never apply together. */
const SINGLE_MEMBERSHIP_TYPES: ReadonlySet<PrincipalType> = new Set([
  PrincipalType.ROLE,
  PrincipalType.USER,
]);

/** Record sections whose entries count as one override each (an MCP server, not its fields). */
const ENTRY_COUNTED_SECTIONS: ReadonlySet<string> = new Set(['mcpServers']);

function isEmptyRecord(value: t.ConfigValue): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/**
 * Leaf paths of a profile's stored overrides: nested objects become prefixes,
 * an array is one leaf, and the empty objects LibreChat leaves behind after a
 * field is removed are not overrides.
 */
export function collectOverridePaths(overrides: t.ConfigRecord): string[] {
  return Object.entries(flattenObject(overrides))
    .filter(([, value]) => !isEmptyRecord(value))
    .map(([path]) => path);
}

/** Whether two scope values point at the same profile. */
export function isSameScope(a: t.ConfigScope, b: t.ConfigScope): boolean {
  return a.principalType === b.principalType && a.principalId === b.principalId;
}

/** Whether a scope selection already points at `next` (re-selecting it is a no-op). */
export function isCurrentSelection(current: t.ScopeSelection, next: t.ScopeSelection): boolean {
  if (current.type === 'BASE' || next.type === 'BASE') return current.type === next.type;
  return isSameScope(current.scope, next.scope);
}

/** "Bob Test (bob@test.local)" for a user profile with a known email, else the name. */
export function formatScopeName(scope: t.ConfigScope): string {
  if (!scope.email || scope.email === scope.name) return scope.name;
  return `${scope.name} (${scope.email})`;
}

/**
 * Identities of the entries a profile stores in each list LibreChat merges
 * entry by entry (`endpoints.custom`): the profile stores only the entries it
 * overrides or adds, so each is one override. Lists it replaces whole (model
 * specs) are one override, the list.
 */
export function scopeOverrideEntries(overrides: t.ConfigRecord): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const collection of KEYED_COLLECTIONS.values()) {
    if (collection.merge !== 'byKey') continue;
    const list = getValueAtPath(overrides, collection.path);
    if (!Array.isArray(list)) continue;
    const keys = list.flatMap((entry) => getEntryKey(entry, collection.key) ?? []);
    if (keys.length > 0) result[collection.path] = keys;
  }
  return result;
}

/**
 * What a profile changes, one item per setting: each overridden leaf, each
 * hidden path, each MCP server once however many of its fields are set, and
 * each entry of a list merged by entry (`scopeOverrideEntries`).
 */
export function listScopeOverrideItems(scope: t.ConfigScope): t.ScopeOverrideItem[] {
  const items = new Map<string, t.ScopeOverrideItem>();
  for (const path of scope.overridePaths ?? []) {
    const entries = scope.overrideEntries?.[path];
    if (entries?.length) {
      for (const entry of entries) {
        items.set(`${path}[${entry}]`, { path, paths: [path], hidden: false, entry });
      }
      continue;
    }
    const [section, entry] = path.split('.', 2);
    const itemPath = ENTRY_COUNTED_SECTIONS.has(section) && entry ? `${section}.${entry}` : path;
    const item = items.get(itemPath);
    if (item) item.paths.push(path);
    else items.set(itemPath, { path: itemPath, paths: [path], hidden: false });
  }
  const hidden = (scope.tombstones ?? []).map((path) => ({ path, paths: [path], hidden: true }));
  return [...items.values(), ...hidden];
}

/** Number of settings a profile changes (see `listScopeOverrideItems`). */
export function countScopeOverrides(scope: t.ConfigScope): number {
  return listScopeOverrideItems(scope).length;
}

/** Every path a profile overrides or hides. */
function scopePaths(scope: t.ConfigScope): string[] {
  return [...(scope.overridePaths ?? []), ...(scope.tombstones ?? [])];
}

function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

/** Whether two profiles can both apply to one user (one role and one user profile per user). */
function canCoApply(a: t.ConfigScope, b: t.ConfigScope): boolean {
  return a.principalType !== b.principalType || !SINGLE_MEMBERSHIP_TYPES.has(a.principalType);
}

/**
 * Active profiles with the same priority as `scope` that can apply to the same
 * user. LibreChat orders profiles by priority only, so for a user both apply
 * to, which value of a setting they both change wins is undefined.
 */
export function findPriorityTies(
  scope: t.ConfigScope,
  scopes: t.ConfigScope[],
): t.ScopePriorityTie[] {
  if (!scope.isActive) return [];
  const own = scopePaths(scope);
  return scopes
    .filter(
      (other) =>
        other.isActive &&
        other.priority === scope.priority &&
        !isSameScope(other, scope) &&
        canCoApply(scope, other),
    )
    .map((other) => {
      const otherPaths = scopePaths(other);
      const shared = own.filter((path) => otherPaths.some((p) => pathsOverlap(path, p)));
      return { scope: other, sharedPaths: shared };
    });
}

/** Ancestor paths of `path`, itself included (`a.b.c` → `a`, `a.b`, `a.b.c`). */
function pathPrefixes(path: string): string[] {
  const parts = path.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/**
 * Indexes profiles by every path they override or hide and each ancestor of
 * it, so a settings row finds the profiles that change it (or something inside
 * it) with one lookup. Profiles are listed in priority order, lowest first.
 */
export function buildScopeIndex(scopes: t.ConfigScope[]): t.ScopeIndex {
  const ordered = [...scopes].sort((a, b) => a.priority - b.priority);
  const byPath = new Map<string, t.ConfigScope[]>();
  for (const scope of ordered) {
    const seen = new Set<string>();
    for (const path of scopePaths(scope)) {
      for (const prefix of pathPrefixes(path)) {
        if (seen.has(prefix)) continue;
        seen.add(prefix);
        const list = byPath.get(prefix);
        if (list) list.push(scope);
        else byPath.set(prefix, [scope]);
      }
    }
  }
  return { scopes: ordered, byPath };
}

const SCOPE_INDEX_CACHE = new WeakMap<t.ConfigScope[], t.ScopeIndex>();

/** `buildScopeIndex` for a scopes list, built once per list (e.g. per query result). */
export function getScopeIndex(scopes: t.ConfigScope[]): t.ScopeIndex {
  const cached = SCOPE_INDEX_CACHE.get(scopes);
  if (cached) return cached;
  const index = buildScopeIndex(scopes);
  SCOPE_INDEX_CACHE.set(scopes, index);
  return index;
}

/**
 * In a profile, marks the sections that cannot be set per profile so they
 * render as an "edit in Base" card, with no table-of-contents entries for the
 * fields the card replaces; base mode returns `sections` unchanged.
 */
export function applyScopeGates(
  sections: t.ConfigSectionConfig[],
  isEditingScope: boolean,
): t.ConfigSectionConfig[] {
  if (!isEditingScope) return sections;
  return sections.map((section) => {
    const scopeGate = getScopeGateReason(section.schemaKey ?? section.id);
    return scopeGate ? { ...section, scopeGate, tocItems: [] } : section;
  });
}

/** Why a change to `path` is not sent to a profile: its section applies to everyone (PR-7). */
export function scopeGateSkipReason(path: string): t.SkipReason | undefined {
  const gate = getScopeGateReason(path);
  return gate ? GATE_SKIP_REASONS[gate] : undefined;
}
