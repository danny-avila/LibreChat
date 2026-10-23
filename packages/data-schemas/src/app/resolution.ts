import {
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_PATHS,
  INTERFACE_PERMISSION_FIELDS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
  PERMISSION_SUB_KEYS,
  isProcessMCPServerConfig,
  normalizeEndpointName,
  EModelEndpoint,
  configSchema,
} from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AdminConfigMergeRules, AppConfig, Config, TWebSearchKeys } from '~/types';
import type { AzureResolvedGroupField } from './azure';
import type { ConfigFieldWrite } from './mutations';
import {
  AZURE_RESOLVED_GROUP_FIELDS,
  lacksAzureAssistantModels,
  narrowAzureServedModels,
  resolveAzureGroups,
} from './azure';
import { isBaseConfigPrincipal, sortByConfigPrecedence } from './precedence';
import { setConfigFields, toConfigOverrideState } from './mutations';
import { webSearchPairedFields, unbindWebSearchKeys } from './web';
import { parseFieldPath, isDotFreePath } from './paths';
import logger from '~/config/winston';

type AnyObject = { [key: string]: unknown };

/** The parts of a principal's config document the merge reads, whichever store returned it. */
export type ConfigOverrideLayer = Pick<Config, 'principalType' | 'priority' | 'overrides'> & {
  principalId: { toString(): string };
  tombstones?: readonly unknown[];
  /** The document's identity: the last tie-break of merge precedence. */
  _id?: { toString(): string } | null;
};

const MAX_MERGE_DEPTH = 10;
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;
/** Schemas whose children the path walk cannot see, so the stored value decides their shape. */
const OPAQUE_SCHEMA_TYPES = new Set(['ZodAny', 'ZodUnknown', 'ZodIntersection']);
const MAX_STRIP_PASSES = 16;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Filters are a fail-closed security boundary even during mixed-package rollouts. */
const BASE_ONLY_OVERRIDE_SECTIONS = new Set<string>(['filters', ...BASE_ONLY_CONFIG_SECTIONS]);
const BASE_PRINCIPAL_OVERRIDE_SECTIONS = new Set<string>(BASE_PRINCIPAL_CONFIG_SECTIONS);

/** Where the resolved Azure config sits in an AppConfig. */
const AZURE_CONFIG_PATH = `endpoints.${EModelEndpoint.azureOpenAI}`;

/** The resolved Azure fields a layer's `groups` replace, as AppConfig paths. */
const AZURE_RESOLVED_PATHS: readonly string[] = AZURE_RESOLVED_GROUP_FIELDS.map(
  (field) => `${AZURE_CONFIG_PATH}.${field}`,
);

/** Azure `groups`, as a librechat.yaml path (the same in an AppConfig). */
const AZURE_GROUPS_PATH = `${AZURE_CONFIG_PATH}.groups`;

/**
 * The paths a tombstone removes: its own, and for Azure `groups` every field they resolve to
 * (`AZURE_RESOLVED_PATHS`), which the Azure clients and model lists read in their place. A
 * tombstone removes the groups whole, as a layer's own `groups` replace them.
 */
function getTombstoneRemovals(path: string): readonly string[] {
  return path === AZURE_GROUPS_PATH ? [path, ...AZURE_RESOLVED_PATHS] : [path];
}

/**
 * `merged` with its Azure groups resolved to none, when it has an Azure endpoint: every field the
 * groups resolve to stays, empty, so the Azure clients and model lists serve no group. Their
 * absence would read differently: the model lists fall back to the environment's default Azure
 * models, which the Azure client, configured by librechat.yaml, cannot map to a group.
 */
function withoutAzureGroups<T extends AnyObject>(merged: T): T {
  const segments = AZURE_CONFIG_PATH.split('.');
  const azure = getPath(merged, segments);
  if (!isPlainObject(azure)) {
    return merged;
  }
  const empty: Record<AzureResolvedGroupField, object> = {
    groupMap: {},
    modelGroupMap: {},
    modelNames: [],
    assistantModels: [],
    assistantGroups: [],
  };
  return setPath(merged, segments, { ...azure, ...empty }) as T;
}

/**
 * Paths within the config tree where arrays of objects should be merged by
 * a key field rather than replaced wholesale. `deepMerge` matches items by
 * the given key, deep-merges matching pairs, preserves unmatched base items,
 * and appends new override-only items.
 *
 * Paths use AppConfig key names (post-OVERRIDE_KEY_MAP remapping),
 * not YAML-level key names. E.g. use `interfaceConfig.x`, not `interface.x`.
 */
const ARRAY_MERGE_KEYS: Record<string, string> = {
  'endpoints.custom': 'name',
};

/**
 * How a merge key is folded before items are matched, by `ARRAY_MERGE_KEYS` path: two
 * spellings the runtime serves as one item are one item to the merge too. Custom endpoint
 * names fold through `normalizeEndpointName`, so an override `ollama` lands on the YAML
 * `Ollama` instead of serving beside it with a different baseURL and key.
 */
const MERGE_KEY_FOLDS: Record<string, (key: string) => string> = {
  'endpoints.custom': normalizeEndpointName,
};

/**
 * Object-valued paths an override replaces whole instead of merging into. A theme
 * definition is one coherent value: merging two would keep the base theme's modes,
 * brands and tokens under the override's name. Uses AppConfig key names.
 */
const ATOMIC_MERGE_PATHS = new Set<string>(['interfaceConfig.theme']);

/**
 * Maps YAML-level override keys (TCustomConfig) to their AppConfig equivalents.
 * Overrides are stored with YAML keys but merged into the already-processed AppConfig
 * where some fields have been renamed by AppService.
 *
 * When AppService renames a field, add the mapping here. Map entries are
 * type-checked: keys must be valid TCustomConfig fields, values must be
 * valid AppConfig fields. The runtime lookup casts string keys to satisfy
 * strict indexing — unknown keys safely fall through via the ?? fallback.
 */
const OVERRIDE_KEY_MAP: Partial<Record<keyof TCustomConfig, keyof AppConfig>> = {
  mcpServers: 'mcpConfig',
  interface: 'interfaceConfig',
  turnstile: 'turnstileConfig',
};

/** AppConfig key → the override (YAML) section merged into it, the inverse of `OVERRIDE_KEY_MAP`. */
const OVERRIDE_SECTION_BY_APP_KEY = new Map<string, string>(
  Object.entries(OVERRIDE_KEY_MAP).flatMap(([section, appKey]) =>
    appKey ? [[appKey, section]] : [],
  ),
);

function toOverridePath(appConfigPath: string): string {
  const [first, ...rest] = appConfigPath.split('.');
  return [OVERRIDE_SECTION_BY_APP_KEY.get(first) ?? first, ...rest].join('.');
}

/** The merge rules in override (YAML) key names, for clients that plan writes the way they merge. */
export function getConfigMergeRules(): AdminConfigMergeRules {
  return {
    arrayMergeKeys: Object.fromEntries(
      Object.entries(ARRAY_MERGE_KEYS).map(([path, key]) => [toOverridePath(path), key]),
    ),
    atomicMergePaths: [...ATOMIC_MERGE_PATHS].map(toOverridePath),
    overrideKeyMap: Object.fromEntries(
      [...OVERRIDE_SECTION_BY_APP_KEY].map(([appKey, section]) => [section, appKey]),
    ),
  };
}

function isSafePath(path: string): boolean {
  const segments = path.split('.');
  if (
    path.length === 0 ||
    path.startsWith('.') ||
    path.endsWith('.') ||
    path.includes('..') ||
    segments.some((segment) => segment.length === 0 || UNSAFE_KEYS.has(segment))
  ) {
    return false;
  }
  return true;
}

/**
 * The key field that identifies entries of the merged-by-key array at an override (YAML) path,
 * such as `name` for `endpoints.custom`; `undefined` for any other path.
 */
export function getConfigArrayMergeKey(segments: readonly string[]): string | undefined {
  const arrayPath = getMergeArrayPath(segments);
  return arrayPath === undefined ? undefined : ARRAY_MERGE_KEYS[arrayPath];
}

/** The `ARRAY_MERGE_KEYS` path of the merged-by-key array at an override (YAML) path. */
function getMergeArrayPath(segments: readonly string[]): string | undefined {
  if (segments.length === 0 || segments.some((segment) => segment.includes('.'))) {
    return undefined;
  }
  const appConfigPath = remapOverridePath(segments.join('.'));
  return hasOwn(ARRAY_MERGE_KEYS, appConfigPath) ? appConfigPath : undefined;
}

/**
 * The identity entry key `key` of the merged-by-key array at an override (YAML) path has: the
 * key as the runtime merge folds it (`foldConfigMergeKey`), so `Ollama` and `ollama` name one
 * custom endpoint to entry changes as they do to the merge. A key at any other path is its own
 * identity.
 */
export function getConfigEntryIdentity(segments: readonly string[], key: string): string {
  const arrayPath = getMergeArrayPath(segments);
  return arrayPath === undefined ? key : foldConfigMergeKey(arrayPath, key);
}

/**
 * `combineFoldedConfigItems` for the merged-by-key array at an override (YAML) path: stored
 * items naming one entry in two spellings, combined as the runtime merge combines them.
 */
export function combineFoldedConfigEntries(
  segments: readonly string[],
  items: unknown[],
): unknown[] {
  const arrayPath = getMergeArrayPath(segments);
  return arrayPath === undefined ? items : combineFoldedConfigItems(arrayPath, items);
}

function remapOverridePath(path: string): string {
  const [first, ...rest] = path.split('.');
  const mappedFirst = OVERRIDE_KEY_MAP[first as keyof typeof OVERRIDE_KEY_MAP] ?? first;
  return [mappedFirst, ...rest].join('.');
}

function isBaseOnlyOverridePath(path: string): boolean {
  return BASE_ONLY_OVERRIDE_SECTIONS.has(path.split('.')[0]);
}

function deletePath<T extends AnyObject>(target: T, path: string): T {
  if (!isSafePath(path)) {
    return target;
  }

  const segments = path.split('.');
  const result = { ...target } as AnyObject;
  let cursor: AnyObject = result;

  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const value = cursor[segment];
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return result as T;
    }
    const cloned = { ...(value as AnyObject) };
    cursor[segment] = cloned;
    cursor = cloned;
  }

  delete cursor[segments[segments.length - 1]];
  return result as T;
}

function deleteConfigPath<T extends AnyObject>(target: T, path: string): T {
  const [section, serverName] = path.split('.');
  if (section !== 'mcpConfig') {
    return deletePath(target, path);
  }

  const mcpConfig = target.mcpConfig;
  if (mcpConfig == null || typeof mcpConfig !== 'object' || Array.isArray(mcpConfig)) {
    return deletePath(target, path);
  }

  const servers = mcpConfig as AnyObject;
  if (serverName != null) {
    return isProcessMCPServerConfig(servers[serverName]) ? target : deletePath(target, path);
  }

  const processServers = Object.fromEntries(
    Object.entries(servers).filter(([, serverConfig]) => isProcessMCPServerConfig(serverConfig)),
  );
  if (Object.keys(processServers).length === 0) {
    return deletePath(target, path);
  }

  return { ...target, mcpConfig: processServers } as T;
}

/**
 * Folds a merge key of the merged-by-key array at `arrayPath` into the identity layers match
 * on (`Ollama` and `ollama` are one custom endpoint); other keys come back unchanged. Code that
 * pairs items across writes, such as secret preservation, matches on the same identity.
 */
export function foldConfigMergeKey(arrayPath: string, key: string): string {
  return hasOwn(MERGE_KEY_FOLDS, arrayPath) ? MERGE_KEY_FOLDS[arrayPath](key) : key;
}

/** The identity an item of the merged-by-key array at `arrayPath` matches on. */
function getMergeKey(item: AnyObject, keyField: string, arrayPath: string): unknown {
  const key = item[keyField];
  return typeof key === 'string' ? foldConfigMergeKey(arrayPath, key) : key;
}

/**
 * Combines the items of a stored merged-by-key array that name one item in more than one
 * spelling of its folded key (`Ollama` and `ollama`): merged in document order, later fields
 * winning, at the first one's position. A document stored before names were folded kept such
 * items apart, and the runtime took requests' `baseURL` and key from the first while serving
 * the later one's metadata, so the combined item keeps what each contributed instead of losing
 * the earlier one as a duplicate. A key repeated in only one spelling is left as is (the last
 * item applies). Returns the same array when nothing combines.
 */
export function combineFoldedConfigItems(arrayPath: string, items: unknown[]): unknown[] {
  const keyField = ARRAY_MERGE_KEYS[arrayPath];
  if (!keyField || !hasOwn(MERGE_KEY_FOLDS, arrayPath)) {
    return items;
  }
  const groups = new Map<string, { spellings: Set<string>; indexes: number[] }>();
  items.forEach((item, index) => {
    const key = isPlainObject(item) ? item[keyField] : undefined;
    if (typeof key !== 'string' || key === '') {
      return;
    }
    const identity = MERGE_KEY_FOLDS[arrayPath](key);
    const group = groups.get(identity) ?? { spellings: new Set<string>(), indexes: [] };
    group.spellings.add(key);
    group.indexes.push(index);
    groups.set(identity, group);
  });
  const depth = arrayPath.split('.').length;
  const combined = new Map<number, AnyObject>();
  const absorbed = new Set<number>();
  for (const { spellings, indexes } of groups.values()) {
    if (spellings.size < 2) {
      continue;
    }
    const [first, ...rest] = indexes;
    const merged = rest.reduce<AnyObject>(
      (item, index) => deepMerge(item, items[index] as AnyObject, depth, arrayPath),
      items[first] as AnyObject,
    );
    combined.set(first, merged);
    rest.forEach((index) => absorbed.add(index));
  }
  if (combined.size === 0) {
    return items;
  }
  return items.flatMap((item, index) => (absorbed.has(index) ? [] : [combined.get(index) ?? item]));
}

/** `combineFoldedConfigItems` over every folded array of a stored overrides document. */
function combineStoredFoldedItems(overrides: unknown, principal: string): unknown {
  let result = overrides;
  for (const arrayPath of Object.keys(MERGE_KEY_FOLDS)) {
    const segments = arrayPath.split('.');
    const items = getPath(result, segments);
    if (!Array.isArray(items)) {
      continue;
    }
    const combined = combineFoldedConfigItems(arrayPath, items);
    if (combined === items) {
      continue;
    }
    logger.warn(
      `[mergeConfigOverrides] Combining "${arrayPath}" items that name one entry in different spellings for ${principal}; a write of this list must name each entry once`,
    );
    result = setPath(result, segments, combined);
  }
  return result;
}

function mergeArrayByKey(
  target: AnyObject[],
  source: AnyObject[],
  keyField: string,
  depth: number,
  path: string,
): AnyObject[] {
  const sourceByKey = new Map<unknown, AnyObject>();
  for (const item of source) {
    if (item != null && typeof item === 'object') {
      const key = getMergeKey(item, keyField, path);
      // Source items without a key value are skipped: no stable identity
      // for matching or appending. (Keyless target items are preserved as-is below.)
      if (key != null) {
        sourceByKey.set(key, item);
      }
    }
  }

  const result: AnyObject[] = [];
  const seen = new Set<unknown>();

  // Pass the array container path (not a per-element path) so item
  // properties build paths like 'endpoints.custom.baseURL' for any
  // nested ARRAY_MERGE_KEYS lookups. A matched item keeps the spelling of
  // its key the layer beneath gave it: an override `ollama` modifies the
  // YAML `Ollama`, which stays the entry's name.
  for (const item of target) {
    if (item != null && typeof item === 'object') {
      const key = getMergeKey(item, keyField, path);
      const override = key != null ? sourceByKey.get(key) : undefined;
      if (override) {
        result.push({ ...deepMerge(item, override, depth + 1, path), [keyField]: item[keyField] });
        seen.add(key);
      } else {
        result.push({ ...item });
      }
    } else {
      result.push(item);
    }
  }

  for (const key of sourceByKey.keys()) {
    if (!seen.has(key)) {
      result.push(deepMerge({} as AnyObject, sourceByKey.get(key)!, depth + 1, path));
    }
  }

  return result;
}

function deepMerge<T extends AnyObject>(target: T, source: AnyObject, depth = 0, path = ''): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) {
      continue;
    }
    const currentPath = path ? `${path}.${key}` : key;
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      depth < MAX_MERGE_DEPTH &&
      !ATOMIC_MERGE_PATHS.has(currentPath) &&
      sourceVal != null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal != null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as AnyObject,
        sourceVal as AnyObject,
        depth + 1,
        currentPath,
      );
    } else if (
      depth < MAX_MERGE_DEPTH &&
      Array.isArray(sourceVal) &&
      Array.isArray(targetVal) &&
      ARRAY_MERGE_KEYS[currentPath]
    ) {
      result[key] = mergeArrayByKey(
        targetVal as AnyObject[],
        sourceVal as AnyObject[],
        ARRAY_MERGE_KEYS[currentPath],
        depth,
        currentPath,
      );
    } else if (
      typeof sourceVal === 'boolean' &&
      targetVal != null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      RUNTIME_CONFIG_INTERFACE_FIELDS.has(key)
    ) {
      // A runtime-config interface field (e.g. schedules) toggled by a boolean
      // override is a runtime enable/disable, not a replacement of its config. Fold
      // the boolean into the `use` flag so inherited object-form limits (maxPerUser,
      // minIntervalMinutes, ...) survive instead of collapsing to global defaults.
      result[key] = { ...(targetVal as AnyObject), use: sourceVal };
    } else if (
      typeof targetVal === 'boolean' &&
      sourceVal != null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      RUNTIME_CONFIG_INTERFACE_FIELDS.has(key)
    ) {
      // Symmetric case: an OBJECT override (e.g. tuning maxPerUser) on top of a
      // BOOLEAN base must inherit the base's enable state unless it sets `use`
      // explicitly — otherwise setting a limit on a globally-disabled feature
      // (`schedules: false`) would silently re-enable it.
      result[key] = { use: targetVal, ...(sourceVal as AnyObject) };
    } else {
      result[key] = sourceVal;
    }
  }
  return result as T;
}

export type ConfigOverrideIssue = {
  /** Dot-path of the override node the issue is attributed to, in YAML (`TCustomConfig`) keys. */
  path: string;
  /** The same location as keys, unambiguous when a record key itself contains a dot. */
  segments: string[];
  /**
   * A stable, machine-readable reason: a zod issue code (`invalid_type`, `custom`, ...),
   * `unknown_section`, `missing_merge_key`, `duplicate_merge_key`, `indexed_merge_key_write`,
   * `union_dropped_key`, `dotted_key`, or `invalid_document`. Schema messages are not carried
   * because they can echo the submitted values.
   */
  code: string;
};

type IssuePath = Array<string | number>;

function isPlainObject(value: unknown): value is AnyObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Whether `key` is a top-level section an override may hold: one `configSchema` defines.
 * Anything else names runtime state the merge would otherwise reach (`paths`, the raw-YAML
 * `config`, the AppService aliases `interfaceConfig`/`mcpConfig`/`turnstileConfig`), so it is
 * rejected on write and ignored at merge. Unknown keys inside a known section stay accepted.
 */
export function isAcceptedOverrideSection(key: string): boolean {
  return hasOwn(configSchema.shape, key);
}

function toIssue(segments: string[], code: string): ConfigOverrideIssue {
  return { path: segments.join('.'), segments, code };
}

/**
 * The override item an issue path segment names: by the merge key for merged-by-key arrays
 * (the merged index differs from the override's; the last item with a key is the one merged), by index, or by `id` for refinements that
 * address an item by its identifier.
 */
function findItemIndex(
  node: unknown[],
  key: string,
  keyField: string | undefined,
  mergedItem: unknown,
  arrayPath: string,
): number {
  if (keyField) {
    if (!isPlainObject(mergedItem)) {
      return -1;
    }
    const mergedKey = getMergeKey(mergedItem, keyField, arrayPath);
    for (let index = node.length - 1; index >= 0; index--) {
      const item = node[index];
      if (isPlainObject(item) && getMergeKey(item, keyField, arrayPath) === mergedKey) {
        return index;
      }
    }
    return -1;
  }
  if (/^\d+$/.test(key)) {
    return Number(key);
  }
  return node.findIndex((item) => isPlainObject(item) && item.id === key);
}

/**
 * The override node an issue in the merged config belongs to: the deepest node the
 * overrides supply on the issue's path. Items of merged-by-key arrays are matched by their
 * key, since the merged index differs from the override's. `undefined` means the overrides
 * did not supply anything on the path, so the issue is the base's own.
 */
function attributeIssue(
  overrides: AnyObject,
  merged: AnyObject,
  issuePath: IssuePath,
): string[] | undefined {
  const segments: string[] = [];
  let node: unknown = overrides;
  let mergedNode: unknown = merged;
  for (const part of issuePath) {
    const key = String(part);
    if (Array.isArray(node)) {
      const arrayPath = segments.join('.');
      const keyField = hasOwn(ARRAY_MERGE_KEYS, arrayPath)
        ? ARRAY_MERGE_KEYS[arrayPath]
        : undefined;
      const mergedItem = Array.isArray(mergedNode) ? mergedNode[Number(key)] : undefined;
      const index = findItemIndex(node, key, keyField, mergedItem, arrayPath);
      if (keyField && index < 0) {
        return undefined;
      }
      if (!Number.isInteger(index) || index < 0 || index >= node.length) {
        break;
      }
      segments.push(String(index));
      node = node[index];
      mergedNode = Array.isArray(mergedNode)
        ? mergedNode[keyField ? Number(key) : index]
        : undefined;
      continue;
    }
    if (!isPlainObject(node) || !hasOwn(node, key)) {
      break;
    }
    segments.push(key);
    node = node[key];
    mergedNode = isPlainObject(mergedNode) ? mergedNode[key] : undefined;
  }
  return segments.length > 0 ? segments : undefined;
}

/**
 * Whether the override node at `segments` is final: at or inside an array the merge replaces
 * (any array not merged by key), so no other layer can supply what it leaves out.
 */
function isReplacedArrayNode(overrides: AnyObject, segments: string[]): boolean {
  let node: unknown = overrides;
  for (let index = 0; index < segments.length; index++) {
    node = Array.isArray(node)
      ? node[Number(segments[index])]
      : (node as AnyObject)[segments[index]];
    const path = segments.slice(0, index + 1).join('.');
    if (Array.isArray(node) && !hasOwn(ARRAY_MERGE_KEYS, path)) {
      return true;
    }
  }
  return false;
}

/**
 * Items of a merged-by-key array must be objects with their own key: the merge drops any
 * other item (or keeps it as is when nothing lies beneath the array). A repeated key is
 * reported on the earlier items: the last one is what the merge keeps.
 */
function getMergeKeyIssues(overrides: AnyObject): ConfigOverrideIssue[] {
  return Object.entries(ARRAY_MERGE_KEYS).flatMap(([arrayPath, keyField]) => {
    const segments = arrayPath.split('.');
    let node: unknown = overrides;
    for (const segment of segments) {
      node = isPlainObject(node) && hasOwn(node, segment) ? node[segment] : undefined;
    }
    if (!Array.isArray(node)) {
      return [];
    }
    const lastIndex = new Map<unknown, number>();
    node.forEach(
      (item, index) =>
        isPlainObject(item) && lastIndex.set(getMergeKey(item, keyField, arrayPath), index),
    );
    return node.flatMap((item, index) => {
      if (!isPlainObject(item) || typeof item[keyField] !== 'string' || item[keyField] === '') {
        return [toIssue([...segments, String(index)], 'missing_merge_key')];
      }
      return lastIndex.get(getMergeKey(item, keyField, arrayPath)) === index
        ? []
        : [toIssue([...segments, String(index)], 'duplicate_merge_key')];
    });
  });
}

type SchemaIssue = NonNullable<
  ReturnType<typeof configSchema.safeParse>['error']
>['issues'][number];

/**
 * A union reports one issue at its own path; the branch whose failures are fewest, then
 * deepest, is the shape the value was written for, so its issues locate the actual fault.
 */
function expandUnionIssues(issues: SchemaIssue[], depth = 0): SchemaIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union' || depth >= MAX_MERGE_DEPTH) {
      return [issue];
    }
    const branches = issue.unionErrors.map((error) => error.issues);
    const closest = branches.reduce<SchemaIssue[] | undefined>((best, branch) => {
      if (!best || branch.length < best.length) {
        return branch;
      }
      const depthOf = (list: SchemaIssue[]) => Math.max(0, ...list.map((i) => i.path.length));
      return branch.length === best.length && depthOf(branch) > depthOf(best) ? branch : best;
    }, undefined);
    return closest && closest.length > 0 ? expandUnionIssues(closest, depth + 1) : [issue];
  });
}

/** The parts of a zod schema the shape walk reads, without depending on zod. */
type SchemaNode = {
  _def: {
    typeName?: string;
    innerType?: SchemaNode;
    schema?: SchemaNode;
    getter?: () => SchemaNode;
    type?: SchemaNode;
    valueType?: SchemaNode;
    left?: SchemaNode;
    right?: SchemaNode;
    options?: SchemaNode[] | Map<unknown, SchemaNode>;
  };
  shape?: Record<string, SchemaNode>;
  safeParse: (value: unknown) => { success: boolean };
};

/** The schema beneath optional, nullable, default, refinement and lazy wrappers. */
function unwrapSchema(schema: SchemaNode): SchemaNode {
  let node = schema;
  for (let depth = 0; depth < MAX_MERGE_DEPTH; depth++) {
    const inner = node._def.innerType ?? node._def.schema ?? node._def.getter?.();
    if (!inner) {
      break;
    }
    node = inner;
  }
  return node;
}

/** The schema one segment below `node`, through objects, records, arrays and union options. */
function getChildSchema(node: SchemaNode, segment: string, depth = 0): SchemaNode | undefined {
  const inner = unwrapSchema(node);
  const { typeName } = inner._def;
  if (typeName === 'ZodObject' && inner.shape) {
    return hasOwn(inner.shape, segment) ? inner.shape[segment] : undefined;
  }
  if (typeName === 'ZodRecord') {
    return inner._def.valueType;
  }
  if (typeName === 'ZodArray') {
    return ARRAY_INDEX.test(segment) ? inner._def.type : undefined;
  }
  if (
    (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') &&
    inner._def.options &&
    depth < MAX_MERGE_DEPTH
  ) {
    for (const option of inner._def.options.values()) {
      const child = getChildSchema(option, segment, depth + 1);
      if (child) {
        return child;
      }
    }
  }
  return undefined;
}

/** Whether {@link getChildSchema} reaches `segment` below `node` through an array. */
function isArrayStep(node: SchemaNode, segment: string, depth = 0): boolean {
  const inner = unwrapSchema(node);
  const { typeName } = inner._def;
  if (typeName === 'ZodArray') {
    return true;
  }
  if (
    (typeName !== 'ZodUnion' && typeName !== 'ZodDiscriminatedUnion') ||
    !inner._def.options ||
    depth >= MAX_MERGE_DEPTH
  ) {
    return false;
  }
  for (const option of inner._def.options.values()) {
    if (getChildSchema(option, segment, depth + 1)) {
      return isArrayStep(option, segment, depth + 1);
    }
  }
  return false;
}

/**
 * The `configSchema` node an override (YAML) path names (`undefined` when the schema does not
 * define it), and whether the path continues past an array on the way. Below a field of a
 * known section that the schema does not define (a key it does not know, or what an
 * intersection or `any` holds), the stored value decides the shape, so an index segment there
 * is taken to name an array element.
 */
function resolveConfigSchemaPath(segments: readonly string[]): {
  node?: SchemaNode;
  throughArray: boolean;
} {
  const [section, ...rest] = segments;
  const shape = configSchema.shape as unknown as Record<string, SchemaNode>;
  if (section === undefined || !hasOwn(shape, section)) {
    return { throughArray: false };
  }
  let node: SchemaNode | undefined = shape[section];
  let throughArray = false;
  for (const segment of rest) {
    if (!node || OPAQUE_SCHEMA_TYPES.has(unwrapSchema(node)._def.typeName ?? '')) {
      node = undefined;
      throughArray = throughArray || ARRAY_INDEX.test(segment);
      continue;
    }
    throughArray = throughArray || isArrayStep(node, segment);
    node = getChildSchema(node, segment);
  }
  return { node, throughArray };
}

/**
 * Whether an override (YAML) path names a record in `configSchema`: an object whose keys are
 * names the operator chooses (`mcpServers`, a `headers` map, `inferenceProfiles`), so one key
 * can be renamed to another without changing what the value means. Fixed-shape objects are not
 * records.
 */
export function isConfigRecordPath(segments: readonly string[]): boolean {
  const { node } = resolveConfigSchemaPath(segments);
  return node != null && unwrapSchema(node)._def.typeName === 'ZodRecord';
}

/**
 * Whether an override (YAML) path continues past an array of `configSchema`, or may: it names
 * an element of the array or a path inside one, or has an index segment below a field of a
 * known section the schema does not define. A tombstone there hides nothing, because the merge
 * removes inherited values from objects only (a whole array can be hidden).
 */
export function isConfigArrayItemPath(segments: readonly string[]): boolean {
  return resolveConfigSchemaPath(segments).throughArray;
}

/**
 * The combined fixed shape of an intersection of objects (`a.and(b)`), or `undefined` when a
 * side is not an object, so nothing is judged on a shape the walk cannot see whole.
 */
function getIntersectionShape(node: SchemaNode, depth = 0): Record<string, SchemaNode> | undefined {
  if (depth >= MAX_MERGE_DEPTH || !node._def.left || !node._def.right) {
    return undefined;
  }
  const [left, right] = [node._def.left, node._def.right].map((side) => {
    const inner = unwrapSchema(side);
    return inner._def.typeName === 'ZodIntersection'
      ? getIntersectionShape(inner, depth + 1)
      : inner.shape;
  });
  return left && right ? { ...left, ...right } : undefined;
}

/** Whether a schema accepts arbitrary keys at this level (a record, or a union with one). */
function isRecordSchema(schema: SchemaNode): boolean {
  const node = unwrapSchema(schema);
  const { typeName, options } = node._def;
  if (typeName === 'ZodRecord') {
    return true;
  }
  return (
    (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') &&
    options != null &&
    [...options.values()].some(isRecordSchema)
  );
}

type ShapeIssue = { code: 'union_dropped_key' | 'dotted_key'; path: IssuePath };

function toDottedKeyIssues(value: AnyObject, path: IssuePath): ShapeIssue[] {
  return Object.keys(value)
    .filter((key) => key.includes('.'))
    .map((key): ShapeIssue => ({ code: 'dotted_key', path: [...path, key] }));
}

/**
 * The walk of an object with a fixed shape: a key holding a dot can only be a mistaken
 * path (`{ 'webSearch.serperApiKey': ... }`), which the schema strips as unknown and the secret
 * registry never sees, so it is reported instead of stored as an inert literal key.
 */
function findObjectShapeIssues(
  shape: Record<string, SchemaNode>,
  value: AnyObject,
  path: IssuePath,
  depth: number,
): ShapeIssue[] {
  return Object.keys(value).flatMap((key): ShapeIssue[] => {
    if (key.includes('.')) {
      return [{ code: 'dotted_key', path: [...path, key] }];
    }
    return hasOwn(shape, key)
      ? findShapeIssues(shape[key], value[key], [...path, key], depth + 1)
      : [];
  });
}

/**
 * What a schema walk finds that parsing does not report:
 * - `union_dropped_key`: an object parses with the first union option that accepts it, and
 *   that option strips keys it does not define, so a key another option defines (and would
 *   type-check) is kept raw in the stored override but never validated.
 * - `dotted_key`: a key holding a dot where the schema has a fixed shape. Dots are only
 *   meaningful in record keys (model names such as `gpt-4.1`, Bedrock inference profiles, MIME
 *   types, header names), which a record keeps as one segment.
 *
 * Keys no schema node defines are unknown keys and stay accepted.
 */
function findShapeIssues(
  schema: SchemaNode,
  value: unknown,
  path: IssuePath,
  depth = 0,
): ShapeIssue[] {
  if (depth >= MAX_MERGE_DEPTH) {
    return [];
  }
  const node = unwrapSchema(schema);
  const { typeName } = node._def;
  if (typeName === 'ZodObject' && node.shape && isPlainObject(value)) {
    return findObjectShapeIssues(node.shape, value, path, depth);
  }
  if (typeName === 'ZodIntersection' && isPlainObject(value)) {
    const shape = getIntersectionShape(node);
    return shape ? findObjectShapeIssues(shape, value, path, depth) : [];
  }
  if (typeName === 'ZodArray' && node._def.type && Array.isArray(value)) {
    const item = node._def.type;
    return value.flatMap((entry, index) =>
      findShapeIssues(item, entry, [...path, index], depth + 1),
    );
  }
  if (typeName === 'ZodRecord' && node._def.valueType && isPlainObject(value)) {
    const entrySchema = node._def.valueType;
    return Object.entries(value).flatMap(([key, entry]) =>
      findShapeIssues(entrySchema, entry, [...path, key], depth + 1),
    );
  }
  if (
    (typeName !== 'ZodUnion' && typeName !== 'ZodDiscriminatedUnion') ||
    !node._def.options ||
    !isPlainObject(value)
  ) {
    return [];
  }
  const options = [...node._def.options.values()];
  const accepted = options.find((option) => option.safeParse(value).success);
  if (!accepted) {
    /** A strict option fails on the dotted key itself, and parsing reports it only as unrecognized. */
    return isRecordSchema(node) ? [] : toDottedKeyIssues(value, path);
  }
  const acceptedShape = unwrapSchema(accepted).shape;
  const defined = new Set(
    options.flatMap((option) => Object.keys(unwrapSchema(option).shape ?? {})),
  );
  const dropped: ShapeIssue[] = acceptedShape
    ? Object.keys(value)
        .filter((key) => !hasOwn(acceptedShape, key) && defined.has(key))
        .map((key): ShapeIssue => ({ code: 'union_dropped_key', path: [...path, key] }))
    : [];
  return [...dropped, ...findShapeIssues(accepted, value, path, depth + 1)];
}

/**
 * Top-level override keys are section names, never paths: a dotted one would be stored as an
 * inert literal key, outside the secret registry and every per-section rule.
 */
export function getDottedSectionIssues(overrides: unknown): ConfigOverrideIssue[] {
  if (!isPlainObject(overrides)) {
    return [];
  }
  return Object.keys(overrides)
    .filter((key) => key.includes('.'))
    .map((key) => toIssue([key], 'dotted_key'));
}

/**
 * Checks config overrides the way they apply: merged over `base` (YAML-shaped), each
 * section they touch parsed with its `configSchema` schema, and every failure attributed
 * to the override node that caused it. Unions, refinements, required fields and defaults
 * are therefore judged on the merged result, not on the patch alone. An issue caused only
 * by leaving something out (a required or related field another layer may supply) is not
 * reported, except inside an array the merge replaces, where nothing can supply it. A top-level
 * key that is not a `configSchema` section is reported as `unknown_section` (or as `dotted_key`
 * alone when it holds a dot); keys the schema does not define inside a known section are
 * accepted unchanged, and a key holding a dot is a `dotted_key` issue unless it sits where the
 * schema has a record.
 */
export function getConfigOverrideIssues(
  overrides: unknown,
  base: Partial<TCustomConfig> = {},
): ConfigOverrideIssue[] {
  if (!isPlainObject(overrides)) {
    return [toIssue([], 'invalid_document')];
  }
  const merged = deepMerge(base as AnyObject, overrides);
  const issues = [...getDottedSectionIssues(overrides), ...getMergeKeyIssues(overrides)];
  const seen = new Set(issues.map((issue) => issue.path));
  const shape = configSchema.shape;
  for (const section of Object.keys(overrides)) {
    if (!hasOwn(shape, section)) {
      if (!seen.has(section)) {
        issues.push(toIssue([section], 'unknown_section'));
      }
      continue;
    }
    const schema = shape[section as keyof typeof shape] as unknown as SchemaNode;
    const result = shape[section as keyof typeof shape].safeParse(merged[section]);
    const shapeIssues = findShapeIssues(schema, merged[section], []);
    const schemaIssues = result.success ? [] : expandUnionIssues(result.error.issues);
    for (const issue of [...shapeIssues, ...schemaIssues]) {
      if (issue.code === 'unrecognized_keys') {
        continue;
      }
      const issuePath: IssuePath = [section, ...issue.path];
      const segments = attributeIssue(overrides, merged, issuePath);
      if (
        !segments ||
        (segments.length < issuePath.length && !isReplacedArrayNode(overrides, segments))
      ) {
        continue;
      }
      const path = segments.join('.');
      if (seen.has(path)) {
        continue;
      }
      seen.add(path);
      issues.push(toIssue(segments, issue.code));
    }
  }
  return issues;
}

/** Sets a path without mutating, replacing whatever is in the way. */
function setPath(target: unknown, segments: string[], value: unknown): unknown {
  if (segments.length === 0) {
    return value;
  }
  const [segment, ...rest] = segments;
  if (Array.isArray(target) && /^\d+$/.test(segment)) {
    const next = [...target];
    next[Number(segment)] = setPath(next[Number(segment)], rest, value);
    return next;
  }
  const next: AnyObject = isPlainObject(target) ? { ...target } : {};
  next[segment] = setPath(next[segment], rest, value);
  return next;
}

function isRelatedPath(a: string[], b: string[]): boolean {
  const length = Math.min(a.length, b.length);
  return a.slice(0, length).every((segment, index) => segment === b[index]);
}

/**
 * The base a principal's override lands on: `base` without the paths the principal
 * tombstones, except those in `cleared` (tombstones the pending write removes).
 */
export function applyConfigTombstones(
  base: Partial<TCustomConfig>,
  tombstones: unknown[] | undefined,
  cleared: Set<string> = new Set(),
): Partial<TCustomConfig> {
  return (tombstones ?? [])
    .filter((path): path is string => typeof path === 'string' && !cleared.has(path))
    .flatMap(getTombstoneRemovals)
    .reduce((current, path) => deletePath(current, path), base as AnyObject);
}

/**
 * An item of a merged-by-key array is identified by its key, not its position: a write by index
 * can rename the stored item, which the runtime merge then treats as a new one. Reports the
 * array once for any write that addresses inside it by position.
 */
export function getIndexedMergeKeyIssues(
  written: ReadonlyArray<readonly string[]>,
): ConfigOverrideIssue[] {
  return Object.keys(ARRAY_MERGE_KEYS).flatMap((arrayPath) => {
    const arraySegments = arrayPath.split('.');
    return written.some(
      (segments) =>
        segments.length > arraySegments.length && isRelatedPath([...segments], arraySegments),
    )
      ? [toIssue(arraySegments, 'indexed_merge_key_write')]
      : [];
  });
}

function hasMergeKey(item: unknown, keyField: string): boolean {
  return isPlainObject(item) && typeof item[keyField] === 'string' && item[keyField] !== '';
}

/**
 * Where an issue sits in `overrides`, in a form that survives entries moving: an item of a
 * merged-by-key array is named by its key's identity (`getConfigEntryIdentity`), or (without
 * one) by its place among the keyless items, rather than by its index. Removing one entry
 * shifts the ones after it, and their issues must still match the ones the stored document
 * already had.
 */
function getIssueLocation(segments: readonly string[], overrides: unknown): string {
  const location: Array<string | { key: unknown } | { keyless: number }> = [];
  let node: unknown = overrides;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const keyField = Array.isArray(node)
      ? getConfigArrayMergeKey(segments.slice(0, index))
      : undefined;
    if (Array.isArray(node) && keyField) {
      const position = Number(segment);
      const item: unknown = node[position];
      location.push(
        hasMergeKey(item, keyField)
          ? {
              key: getConfigEntryIdentity(
                segments.slice(0, index),
                (item as AnyObject)[keyField] as string,
              ),
            }
          : {
              keyless: node.slice(0, position).filter((other) => !hasMergeKey(other, keyField))
                .length,
            },
      );
      node = item;
      continue;
    }
    location.push(segment);
    if (Array.isArray(node)) {
      node = node[Number(segment)];
    } else {
      node = isPlainObject(node) && hasOwn(node, segment) ? node[segment] : undefined;
    }
  }
  return JSON.stringify(location);
}

/**
 * Checks a principal's next override document in its final state: `candidate` merged over
 * `base` without the candidate's tombstones, so a batch that tombstones a field and sets its
 * replacement is judged on the end result rather than step by step. An issue is reported when
 * it touches a `written` path (in either direction), or when the change introduced it
 * elsewhere (a related field the change made invalid); issues the stored document already had
 * (at the same location, entries of merged-by-key arrays matched by key) are left to merge
 * time so they do not block an unrelated change.
 *
 * The stored document is judged on the base its own tombstones leave, so an issue that a
 * removed tombstone brings back counts as new. `lifted` names stored tombstones to treat as
 * already removed there: tombstones the change replaced with values of its own.
 */
export function getConfigChangeIssues(
  candidate: { overrides?: unknown; tombstones?: unknown[] },
  base: Partial<TCustomConfig>,
  stored: { overrides?: unknown; tombstones?: unknown[] } | null | undefined,
  written: ReadonlyArray<readonly string[]>,
  lifted: Iterable<string> = [],
): ConfigOverrideIssue[] {
  const candidateState = toConfigOverrideState(candidate);
  const storedState = toConfigOverrideState(stored);
  const existing = new Set(
    getConfigOverrideIssues(
      storedState.overrides,
      applyConfigTombstones(base, storedState.tombstones, new Set(lifted)),
    ).map((issue) => getIssueLocation(issue.segments, storedState.overrides)),
  );
  return getConfigOverrideIssues(
    candidateState.overrides,
    applyConfigTombstones(base, candidateState.tombstones),
  ).filter(
    (issue) =>
      !existing.has(getIssueLocation(issue.segments, candidateState.overrides)) ||
      written.some((segments) => isRelatedPath(issue.segments, [...segments])),
  );
}

/**
 * Checks field writes on top of the principal's stored config, building the result with the
 * same transform the write stores (`setConfigFields`): each path set in order, and the
 * tombstones those paths clear removed. `fields` is either a map of dotted field paths or a
 * list of segment writes (which can address keys that contain dots). A path the stored
 * document cannot take (below a scalar, or a named key of an array) throws a
 * `ConfigPathError`. See {@link getConfigChangeIssues} for which issues are reported.
 *
 * A tombstone a write replaces with its own value counts as lifted for the stored document
 * too, so a client that sends one field per request can switch a union's shape (set the new
 * field, then reset the old ones). A tombstone a deeper write clears as a side effect does
 * not: setting `memory.agent.enabled` under a hidden `memory.agent` brings the inherited agent
 * back, and a conflict with the stored fields is reported instead of being dropped at merge.
 */
export function getConfigFieldIssues(
  fields: Record<string, unknown> | readonly ConfigFieldWrite[],
  base: Partial<TCustomConfig> = {},
  stored?: { overrides?: unknown; tombstones?: unknown[] } | null,
): ConfigOverrideIssue[] {
  const writes: readonly ConfigFieldWrite[] = Array.isArray(fields)
    ? fields
    : Object.entries(fields).map(([fieldPath, value]) => ({
        segments: parseFieldPath(fieldPath),
        value,
      }));
  const written = writes.map(({ segments }) => [...segments]);
  const indexed = getIndexedMergeKeyIssues(written);
  if (indexed.length > 0) {
    return indexed;
  }
  const candidate = setConfigFields(toConfigOverrideState(stored), writes);
  const lifted = written.filter(isDotFreePath).map((segments) => segments.join('.'));
  return getConfigChangeIssues(candidate, base, stored, written, lifted);
}

function omitPath(target: unknown, segments: string[]): unknown {
  const [segment, ...rest] = segments;
  if (Array.isArray(target)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= target.length) {
      return target;
    }
    const next = [...target];
    if (rest.length === 0) {
      next.splice(index, 1);
    } else {
      next[index] = omitPath(next[index], rest);
    }
    return next;
  }
  if (!isPlainObject(target) || !hasOwn(target, segment)) {
    return target;
  }
  const next = { ...target };
  const child = rest.length === 0 ? undefined : omitPath(next[segment], rest);
  /** A node its repairs emptied supplies nothing, so the value beneath it stays instead. */
  const emptied = child != null && typeof child === 'object' && Object.keys(child).length === 0;
  if (rest.length === 0 || emptied) {
    delete next[segment];
  } else {
    next[segment] = child;
  }
  return next;
}

/**
 * Drops the override nodes that make the merged config fail `configSchema`, so an invalid
 * stored value (written before write-time validation, by an older server, or one that only
 * fails once layered over other overrides) leaves the value beneath it in place. A layer
 * is not judged on what it leaves out, since a layer that merges after it may supply it.
 */
function stripInvalidOverrides(
  config: ConfigOverrideLayer,
  base: Partial<TCustomConfig>,
): AnyObject {
  const principal = `${config.principalType}/${config.principalId}`;
  let stripped: unknown = combineStoredFoldedItems(config.overrides, principal);
  /**
   * Removing a field can make a related field it supplies fail, so check again while
   * removals make progress. If they stop, only the sections that still fail are dropped.
   */
  for (let pass = 0; pass < MAX_STRIP_PASSES; pass++) {
    const issues = getConfigOverrideIssues(stripped, base);
    if (issues.length === 0) {
      return stripped as AnyObject;
    }
    if (issues.some((issue) => issue.segments.length === 0)) {
      logger.warn(`[mergeConfigOverrides] Ignoring malformed overrides document for ${principal}`);
      return {};
    }
    const before = stripped;
    for (let index = issues.length - 1; index >= 0; index--) {
      const { path, segments, code } = issues[index];
      logger.warn(
        `[mergeConfigOverrides] Ignoring invalid override "${path}" for ${principal} (${code})`,
      );
      stripped = omitPath(stripped, segments);
    }
    if (stripped === before) {
      break;
    }
  }
  const failing = new Set(
    getConfigOverrideIssues(stripped, base).map((issue) => issue.segments[0]),
  );
  logger.warn(
    `[mergeConfigOverrides] Ignoring still-invalid sections ${[...failing].join(', ')} for ${principal}`,
  );
  return Object.fromEntries(
    Object.entries(stripped as AnyObject).filter(([section]) => !failing.has(section)),
  );
}

function filterMCPServerOverrides(value: unknown, current: unknown): AnyObject {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const currentServers =
    current != null && typeof current === 'object' && !Array.isArray(current)
      ? (current as AnyObject)
      : {};
  const filtered: AnyObject = {};

  for (const [serverName, serverOverride] of Object.entries(value)) {
    const currentServer = currentServers[serverName];
    if (
      serverOverride == null ||
      typeof serverOverride !== 'object' ||
      Array.isArray(serverOverride)
    ) {
      if (!isProcessMCPServerConfig(currentServer)) {
        filtered[serverName] = serverOverride;
      }
      continue;
    }

    const baseServer =
      currentServer != null && typeof currentServer === 'object' && !Array.isArray(currentServer)
        ? (currentServer as AnyObject)
        : {};
    const resolved = deepMerge(baseServer, serverOverride as AnyObject);
    if (!isProcessMCPServerConfig(resolved)) {
      filtered[serverName] = serverOverride;
    }
  }

  return filtered;
}

/** One layer's step through {@link mergeConfigOverrides}, as `afterLayer` sees it. */
export interface ConfigMergeStep {
  layer: ConfigOverrideLayer;
  /** The base config the merge started from, before any layer. */
  base: AppConfig;
  /** The merged config before this layer applied its tombstones and overrides. */
  below: AppConfig;
  /**
   * What the layer's overrides contributed, under AppConfig section names (`mcpConfig`,
   * `interfaceConfig`, ...), after invalid, base-only and filtered values were removed.
   */
  applied: Readonly<Record<string, unknown>>;
  /** The merged config with this layer applied. */
  merged: AppConfig;
  /**
   * The base config with only this layer applied (its tombstones, then its overrides; its Azure
   * `groups` replacing what librechat.yaml's resolved to), as if no other layer were below it.
   * Computed on first call.
   */
  alone: () => AppConfig;
}

export interface MergeConfigOverridesOptions {
  /**
   * Runs after each layer merges; the config it returns is what the next layer merges onto. A
   * caller uses it to apply a policy that depends on what a layer inherited and what it changed,
   * such as dropping an inherited credential the layer sends somewhere new.
   */
  afterLayer?: (step: ConfigMergeStep) => AppConfig;
  /**
   * Told about each stored web search key the merge withholds from the URL it was not entered
   * for, with the layer whose write moved it: the URL's writer when it is the later layer, and
   * otherwise the key's own. When given, it reports these instead of the merge's own warning.
   */
  onWebSearchKeyUnbound?: (unbound: WebSearchKeyUnbound) => void;
}

/** A stored web search key the merge withholds, and the layer whose write caused it. */
export interface WebSearchKeyUnbound {
  layer: ConfigOverrideLayer;
  url: TWebSearchKeys;
  apiKey: TWebSearchKeys;
}

/** One layer's step through {@link foldConfigLayers}, from which `ConfigMergeStep` is built. */
interface FoldStep<T> {
  layer: ConfigOverrideLayer;
  below: T;
  /** What the layer's overrides contributed, under AppConfig section names. */
  applied: AnyObject;
  merged: T;
  /**
   * What the layer removed before its overrides landed, as AppConfig paths: its tombstones that
   * applied, and the resolved Azure fields its `groups` replace.
   */
  removed: readonly string[];
}

/** The override document that last set or removed a paired web search field, and its merge position. */
interface WebSearchWriter {
  config: ConfigOverrideLayer;
  order: number;
  removed: boolean;
}

type WebSearchWriters = Map<TWebSearchKeys, WebSearchWriter>;

const WEB_SEARCH_TOMBSTONE_PREFIX = 'webSearch.';

/** Records `writer` for each paired web search field its applied overrides set. */
function recordWebSearchWrites(
  writers: WebSearchWriters,
  section: unknown,
  writer: WebSearchWriter,
): void {
  if (!isPlainObject(section)) {
    return;
  }
  for (const field of webSearchPairedFields) {
    if (hasOwn(section, field)) {
      writers.set(field, writer);
    }
  }
}

/** Records `writer` for each paired web search field an applied tombstone removes. */
function recordWebSearchTombstone(
  writers: WebSearchWriters,
  path: string,
  writer: WebSearchWriter,
): void {
  if (path === 'webSearch') {
    for (const field of webSearchPairedFields) {
      writers.set(field, writer);
    }
    return;
  }
  if (!path.startsWith(WEB_SEARCH_TOMBSTONE_PREFIX)) {
    return;
  }
  const field = path.slice(WEB_SEARCH_TOMBSTONE_PREFIX.length) as TWebSearchKeys;
  if (webSearchPairedFields.includes(field)) {
    writers.set(field, writer);
  }
}

function describeLayer(writer?: WebSearchWriter): string {
  return writer ? `${writer.config.principalType}/${writer.config.principalId}` : 'the base config';
}

/**
 * Withholds each stored web search key whose URL a layer other than the key's
 * own decides (`unbindWebSearchKeys`), so a layer that overrides only a URL
 * never sends on a key it cannot read. `writers` lists the override document
 * behind each field; unlisted fields come from the base config.
 */
function bindWebSearchKeys(
  merged: AppConfig,
  writers: WebSearchWriters,
  onUnbound?: MergeConfigOverridesOptions['onWebSearchKeyUnbound'],
): AppConfig {
  const { webSearch, unbound } = unbindWebSearchKeys(
    merged.webSearch,
    (field) => writers.get(field)?.order,
  );
  if (unbound.length === 0) {
    return merged;
  }
  for (const { url, apiKey } of unbound) {
    const urlWriter = writers.get(url);
    const keyWriter = writers.get(apiKey);
    if (onUnbound) {
      const cause = (urlWriter?.order ?? -1) > (keyWriter?.order ?? -1) ? urlWriter : keyWriter;
      if (cause) {
        onUnbound({ layer: cause.config, url, apiKey });
      }
      continue;
    }
    logger.warn(
      `[mergeConfigOverrides] Ignoring webSearch.${apiKey} from ${describeLayer(keyWriter)}: ` +
        `webSearch.${url} is ${urlWriter?.removed ? 'removed' : 'set'} by ${describeLayer(urlWriter)}. ` +
        'Store the key in the same config as the URL.',
    );
  }
  return { ...merged, webSearch };
}

function describePrincipal(config: ConfigOverrideLayer): string {
  return `${config.principalType}/${config.principalId}`;
}

/**
 * The document with only what the merge may apply: override keys and tombstones under a
 * top-level section `configSchema` defines. Anything else was stored before writes were
 * checked (or by another writer) and would reach runtime state no override may set, so it is
 * dropped here, which neutralizes it without a migration. One warning per document.
 */
function withAcceptedSections(config: ConfigOverrideLayer): ConfigOverrideLayer {
  const ignored = new Set<string>();
  let overrides = config.overrides;
  if (isPlainObject(overrides)) {
    const accepted: AnyObject = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (isAcceptedOverrideSection(key)) {
        accepted[key] = value;
      } else {
        ignored.add(key);
      }
    }
    overrides = accepted as Partial<TCustomConfig>;
  }
  let tombstones = config.tombstones;
  if (Array.isArray(tombstones)) {
    tombstones = tombstones.filter((path) => {
      if (typeof path !== 'string') {
        return false;
      }
      const section = path.split('.')[0];
      if (isAcceptedOverrideSection(section)) {
        return true;
      }
      ignored.add(section);
      return false;
    });
  }
  if (ignored.size === 0) {
    return config;
  }
  logger.warn(
    `[mergeConfigOverrides] Ignoring unknown config sections ${[...ignored].join(', ')} for ${describePrincipal(config)}`,
  );
  return { ...config, overrides, tombstones };
}

/**
 * A layer's `endpoints` override with its Azure `groups` resolved as AppService resolves
 * librechat.yaml's (`resolveAzureGroups`): the Azure clients read `groupMap`, `modelGroupMap` and
 * the model lists resolved with them, never `groups`. The layer's groups replace the groups below
 * whole, as its `groups` array does in the YAML-shaped config, so what they resolve to replaces
 * what those resolved to (the caller removes that first); a resolved field the same layer also
 * writes directly merges over its own groups' (objects) or replaces it. `null` when the layer
 * writes no groups, or groups that do not resolve, which then stay unread, with a warning.
 */
function resolveLayerAzureGroups(
  endpoints: unknown,
  config: ConfigOverrideLayer,
): AnyObject | null {
  if (!isPlainObject(endpoints)) {
    return null;
  }
  const azure = endpoints[EModelEndpoint.azureOpenAI];
  if (!isPlainObject(azure) || !Array.isArray(azure.groups)) {
    return null;
  }
  const resolved = resolveAzureGroups(azure.groups);
  if (!resolved.isValid) {
    logger.warn(
      `[mergeConfigOverrides] Ignoring ${AZURE_CONFIG_PATH}.groups for ${describePrincipal(config)}: ${resolved.errors.join('; ')}`,
    );
    return null;
  }
  const next: AnyObject = { ...azure };
  for (const field of AZURE_RESOLVED_GROUP_FIELDS) {
    const own = azure[field];
    const derived: unknown = resolved[field];
    next[field] =
      isPlainObject(own) && isPlainObject(derived) ? deepMerge(derived, own) : (own ?? derived);
  }
  return { ...endpoints, [EModelEndpoint.azureOpenAI]: next };
}

/**
 * `merged` with the Azure model lists narrowed to what its groups serve
 * (`narrowAzureServedModels`), and Azure assistants turned off when none of the models it serves
 * supports them (`lacksAzureAssistantModels`), a combination `azureConfigSetup` refuses in
 * librechat.yaml. A list an override writes directly, or one whose groups a later layer replaced
 * or tombstoned, could otherwise name a model no group serves, and groups without an assistant
 * model under an inherited `assistants: true` would leave the Azure Assistants client no model to
 * default to. Judged on the merged result, so a later layer whose groups serve assistants keeps
 * them on.
 */
function withServedAzureModels<T extends AppConfig>(
  merged: T,
  configs: readonly ConfigOverrideLayer[],
): T {
  const endpoints = merged.endpoints;
  const azure = endpoints?.[EModelEndpoint.azureOpenAI];
  if (!endpoints || !azure) {
    return merged;
  }
  const principals = configs.map(describePrincipal).join(', ');
  const { config: served, narrowed } = narrowAzureServedModels(azure);
  if (narrowed.length > 0) {
    logger.warn(
      `[mergeConfigOverrides] Leaving out of ${narrowed.map((field) => `${AZURE_CONFIG_PATH}.${field}`).join(', ')} for ${principals} the Azure models and groups no merged group serves`,
    );
  }
  const assistantsOff = lacksAzureAssistantModels(served);
  if (assistantsOff) {
    logger.warn(
      `[mergeConfigOverrides] Turning off ${AZURE_CONFIG_PATH}.assistants for ${principals}: none of the Azure models they serve supports assistants`,
    );
  }
  if (narrowed.length === 0 && !assistantsOff) {
    return merged;
  }
  return {
    ...merged,
    endpoints: {
      ...endpoints,
      [EModelEndpoint.azureOpenAI]: assistantsOff ? { ...served, assistants: false } : served,
    },
  };
}

/**
 * Folds override layers, in merge precedence order (`compareConfigPrecedence`), into
 * `merged`, the served config, and `raw`, the YAML-shaped config each layer is validated on
 * before it lands (`stripInvalidOverrides`). `merged` starts as any object whose `mcpConfig`
 * is the MCP servers config of `raw`, because the process-MCP filter reads it. A layer's Azure
 * `groups` resolve into the fields the Azure clients read (`resolveLayerAzureGroups`).
 * `webSearchWriters` names the layer behind each paired web search field, by its position in
 * that order. `afterLayer` runs after each layer lands, and the next layer folds onto what it
 * returns.
 */
function foldConfigLayers<T extends AnyObject>(
  initial: T,
  initialRaw: Partial<TCustomConfig>,
  configs: readonly ConfigOverrideLayer[],
  afterLayer?: (step: FoldStep<T>) => T,
): { merged: T; raw: Partial<TCustomConfig>; webSearchWriters: WebSearchWriters } {
  const sorted = sortByConfigPrecedence(configs);
  let merged = initial;
  let raw = initialRaw;
  const webSearchWriters: WebSearchWriters = new Map();
  for (let order = 0; order < sorted.length; order++) {
    const config = withAcceptedSections(sorted[order]);
    const below = merged;
    let contributed: AnyObject = {};
    const removed: string[] = [];
    const isBasePrincipal = isBaseConfigPrincipal(config);
    if (Array.isArray(config.tombstones)) {
      const removal: WebSearchWriter = { config, order, removed: true };
      for (const path of config.tombstones) {
        if (
          typeof path === 'string' &&
          !isBaseOnlyOverridePath(path) &&
          (isBasePrincipal || !BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(path.split('.')[0]))
        ) {
          for (const removedPath of getTombstoneRemovals(path)) {
            const mappedPath = remapOverridePath(removedPath);
            removed.push(mappedPath);
            merged = deleteConfigPath(merged, mappedPath);
            raw = deletePath(raw as AnyObject, removedPath) as Partial<TCustomConfig>;
          }
          if (path === AZURE_GROUPS_PATH) {
            merged = withoutAzureGroups(merged);
          }
          recordWebSearchTombstone(webSearchWriters, path, removal);
        }
      }
    }

    if (config.overrides && typeof config.overrides === 'object') {
      const remapped: AnyObject = {};
      const applied: AnyObject = {};
      let replacesAzureGroups = false;
      for (const [key, value] of Object.entries(stripInvalidOverrides(config, raw))) {
        if (
          BASE_ONLY_OVERRIDE_SECTIONS.has(key) ||
          (!isBasePrincipal && BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(key))
        ) {
          continue;
        }
        applied[key] = value;
        const mappedKey = OVERRIDE_KEY_MAP[key as keyof typeof OVERRIDE_KEY_MAP] ?? key;
        if (mappedKey === 'mcpConfig') {
          remapped[mappedKey] = filterMCPServerOverrides(value, merged[mappedKey]);
          /** A server the filter removed must not complete a later layer's partial of it. */
          applied[key] = remapped[mappedKey];
        } else if (
          key === 'interface' &&
          value != null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          const filtered: AnyObject = {};
          for (const [field, fieldVal] of Object.entries(value as AnyObject)) {
            if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
              filtered[field] = fieldVal;
            } else if (
              fieldVal != null &&
              typeof fieldVal === 'object' &&
              !Array.isArray(fieldVal)
            ) {
              // Composite permission field (e.g. mcpServers): strip permission
              // sub-keys but preserve UI-only sub-keys like placeholder/trustCheckbox.
              const uiOnly: AnyObject = {};
              for (const [sub, subVal] of Object.entries(fieldVal as AnyObject)) {
                if (!PERMISSION_SUB_KEYS.has(sub)) {
                  uiOnly[sub] = subVal;
                }
              }
              if (Object.keys(uiOnly).length > 0) {
                filtered[field] = uiOnly;
              }
            } else if (RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
              // Dual-purpose field: the boolean form is a runtime disable, not a
              // permission toggle, so preserve it (e.g. schedules: false).
              filtered[field] = fieldVal;
            }
            // other boolean permission fields (e.g. runCode: false) are fully stripped
          }
          if (Object.keys(filtered).length > 0) {
            remapped[mappedKey] = filtered;
          }
        } else if (key === 'endpoints') {
          const resolved = resolveLayerAzureGroups(value, config);
          remapped[mappedKey] = resolved ?? value;
          replacesAzureGroups = resolved != null;
        } else {
          remapped[mappedKey] = value;
        }
      }
      if (replacesAzureGroups) {
        for (const path of AZURE_RESOLVED_PATHS) {
          merged = deletePath(merged, path);
          removed.push(path);
        }
      }
      merged = deepMerge(merged, remapped);
      raw = deepMerge(raw as AnyObject, applied) as Partial<TCustomConfig>;
      recordWebSearchWrites(webSearchWriters, applied.webSearch, {
        config,
        order,
        removed: false,
      });
      contributed = remapped;
    }

    if (afterLayer) {
      merged = afterLayer({ layer: config, below, applied: contributed, merged, removed });
    }
  }
  return { merged, raw, webSearchWriters };
}

/**
 * Merge DB config overrides into a base AppConfig.
 *
 * Configs merge in precedence order (`compareConfigPrecedence`): Base first, then ascending
 * priority, then role < group < user, then document identity; the last layer wins. Each
 * config's `overrides` is deep-merged into the base config in that order. A stored web search
 * key is dropped when a layer other than its own decides the URL it is sent to, the Azure model
 * lists name only models the merged groups serve, and Azure assistants none of those supports
 * are turned off (`withServedAzureModels`).
 */
export function mergeConfigOverrides(
  baseConfig: AppConfig,
  configs: readonly ConfigOverrideLayer[],
  options: MergeConfigOverridesOptions = {},
): AppConfig {
  if (!configs || configs.length === 0) {
    return baseConfig;
  }
  const { afterLayer } = options;
  const folded = foldConfigLayers(
    { ...baseConfig },
    baseConfig.config ?? {},
    configs,
    afterLayer &&
      (({ layer, below, applied, merged, removed }) => {
        let alone: AppConfig | undefined;
        return afterLayer({
          layer,
          base: baseConfig,
          below,
          applied,
          merged,
          alone: () => {
            alone ??= deepMerge(
              removed.reduce((current, path) => deleteConfigPath(current, path), { ...baseConfig }),
              applied,
            );
            return alone;
          },
        });
      }),
  );
  const merged = bindWebSearchKeys(
    withServedAzureModels(folded.merged, configs),
    folded.webSearchWriters,
    options.onWebSearchKeyUnbound,
  );
  return preserveBaseOnlyPaths(baseConfig, preserveRuntimeStops(baseConfig, merged));
}

/**
 * The YAML-shaped config `configs` resolve to on top of `baseYaml`: exactly the value
 * {@link mergeConfigOverrides} validates the next layer on, with the same precedence order,
 * tombstones, base-only and dedicated-section filtering, invalid-override stripping and
 * process-MCP filtering. It is a validation floor, not the served config (no AppService
 * derivation runs on it).
 */
export function resolveRawConfig(
  baseYaml: Partial<TCustomConfig>,
  configs: readonly ConfigOverrideLayer[],
): Partial<TCustomConfig> {
  if (configs.length === 0) {
    return baseYaml;
  }
  /** AppService serves `mcpServers` as `mcpConfig` unchanged (or `null`), and the fold reads it there. */
  return foldConfigLayers({ mcpConfig: baseYaml.mcpServers ?? null }, baseYaml, configs).raw;
}

function getPath(target: unknown, segments: string[]): unknown {
  let current = target;
  for (const segment of segments) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Puts back the base value of every `BASE_ONLY_CONFIG_PATHS` field, whatever an override set or a
 * tombstone removed on the way, so every reader of the merged config sees the operator's value.
 */
function preserveBaseOnlyPaths<T extends AppConfig>(baseConfig: AppConfig, merged: T): T {
  let result: unknown = merged;
  for (const path of BASE_ONLY_CONFIG_PATHS) {
    const segments = path.split('.');
    const value = getPath(baseConfig, segments);
    if (getPath(result, segments) !== value) result = setPath(result, segments, value);
  }
  return result as T;
}

/** Whether a runtime-config interface field reads as OFF in either of its two shapes:
 *  boolean `false`, or the object form with `use: false`. Exported so runtime gates
 *  (e.g. the schedule engine's global stop) apply the same semantics as the merge. */
export function isRuntimeDisabled(value: unknown): boolean {
  if (value === false) {
    return true;
  }
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as AnyObject).use === false
  );
}

/**
 * Re-applies a BASE-level runtime stop after all overrides are merged.
 *
 * A deployment that turns a runtime feature off is not making a preference an override
 * can outrank: the service reads the base value and keeps refusing writes, so an
 * override that only flips the client's view produces a panel whose every action fails.
 *
 * Applied here rather than inside the merge deliberately. The merge folds overrides in
 * precedence order into an ACCUMULATED value, so a guard there compares against whatever
 * the previous override left — which let an EARLIER `false` block a LATER `true` and broke
 * last-layer-wins. Overrides still order normally among themselves; only the base stop is
 * non-negotiable.
 */
function preserveRuntimeStops<T extends AppConfig>(baseConfig: AppConfig, merged: T): T {
  const baseInterface = (baseConfig as unknown as AnyObject).interfaceConfig as
    | AnyObject
    | undefined;
  const mergedInterface = (merged as unknown as AnyObject).interfaceConfig as AnyObject | undefined;
  if (baseInterface == null || mergedInterface == null) {
    return merged;
  }
  let patched: AnyObject | undefined;
  for (const key of RUNTIME_CONFIG_INTERFACE_FIELDS) {
    if (!isRuntimeDisabled(baseInterface[key]) || isRuntimeDisabled(mergedInterface[key])) {
      continue;
    }
    const current = mergedInterface[key];
    patched ??= { ...mergedInterface };
    patched[key] =
      current != null && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as AnyObject), use: false }
        : false;
  }
  if (patched == null) {
    return merged;
  }
  return { ...(merged as unknown as AnyObject), interfaceConfig: patched } as unknown as T;
}
