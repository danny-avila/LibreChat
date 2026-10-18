import {
  configSchema,
  isProcessMCPServerField,
  isProcessMCPServerConfig,
} from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  getEntryKey,
  diffOverride,
  hasHiddenSecret,
  mergeConfigLayers,
  getKeyedCollection,
  resolveCollectionOps,
  findKeyedCollectionEntry,
} from './collections';
import {
  getConfigSection,
  getReadOnlyReason,
  SECRET_CONFIG_KEYS,
  BLOCK_UNSAFE_CONFIG_KEYS,
  UNSAFE_CONFIG_KEY_MESSAGE,
} from '~/admin/constants';
import {
  validateEntry,
  validateField,
  validateSection,
  describeIssueCode,
  validateLoadableEndpoint,
} from './validation';
import {
  isConfigRecord,
  getValueAtPath,
  setValueAtPath,
  removeValueAtPath,
  isConfigValueEqual,
} from './format';
import { isSecretKey, toSecretPreviewKey, valueOrSecretPreview } from './secrets';
import { findYamlManagedValues, getWriteSkipReason } from './writes';
import { isBlankText, findBlankText, findUnsafeKeys } from './keys';
import { resolveSubSchema, unwrapSchema } from './schema';
import { scopeGateSkipReason } from './scopes';

/** Whether a write at `path` sets a process-backed (stdio) MCP server field, which the admin API rejects. */
export function isProcessMcpWrite(path: string, value: t.ConfigValue): boolean {
  const [section, serverName, field] = path.split('.');
  if (section !== 'mcpServers') return false;
  if (serverName == null) {
    return isConfigRecord(value) && Object.values(value).some(isProcessMCPServerConfig);
  }
  if (field == null) return isProcessMCPServerConfig(value);
  return isProcessMCPServerField(field) || (field === 'type' && value === 'stdio');
}

/**
 * Write-rule problems of one value: YAML-managed fields, process-backed MCP
 * fields and unsafe keys. In a keyed collection's list, each problem names
 * its entry, since the list's positions are not the ones the page shows.
 */
export function findWriteRuleIssues(path: string, value: t.ConfigValue): t.ConfigIssue[] {
  const issues = findValueRuleIssues(path, value);
  const collection = getKeyedCollection(path);
  if (!collection || !Array.isArray(value) || issues.length === 0) return issues;
  return issues.map((issue) => withEntryOf(issue, collection, value));
}

function withEntryOf(
  issue: t.ConfigIssue,
  collection: t.KeyedCollection,
  entries: t.ConfigValue[],
): t.ConfigIssue {
  const located = findKeyedCollectionEntry(issue.path);
  if (!located || located.collection.path !== collection.path) return issue;
  const identity = getEntryKey(entries[located.index], collection.key);
  if (identity === undefined) return issue;
  return { ...issue, entryIdentity: identity, entryPath: located.rest };
}

function findValueRuleIssues(path: string, value: t.ConfigValue): t.ConfigIssue[] {
  const managed = findYamlManagedValues(path, value);
  if (managed.length > 0) {
    return managed.map((managedPath) => ({
      path: managedPath,
      code: 'YAML_MANAGED',
      message: describeIssueCode('YAML_MANAGED', undefined, ''),
    }));
  }
  if (isProcessMcpWrite(path, value)) {
    return [
      {
        path,
        code: 'PROCESS_MCP_FIELD',
        message: describeIssueCode('PROCESS_MCP_FIELD', undefined, ''),
      },
    ];
  }
  const blank = [...blankPathKeys(path), ...findBlankText(value, path)].map(blankTextIssue);
  if (!BLOCK_UNSAFE_CONFIG_KEYS) return blank;
  const unsafe = findUnsafeKeys(value, path).map(({ path: holder, key }) => ({
    path: holder,
    code: 'UNSAFE_KEY',
    message: `"${key}": ${UNSAFE_CONFIG_KEY_MESSAGE}`,
    params: { key },
  }));
  return [...unsafe, ...blank];
}

const BLANK_TEXT_CODES: ReadonlySet<string> = new Set(['BLANK_VALUE', 'BLANK_KEY']);

/** A blank key named by the write path itself (an imported `headers: { "  ": … }` leaf). */
function blankPathKeys(path: string): t.BlankConfigText[] {
  const segments = path.split('.');
  const at = segments.findIndex((segment) => isBlankText(segment));
  if (at <= 0) return [];
  return [{ path: segments.slice(0, at).join('.'), key: segments[at] }];
}

/** A whitespace-only string or key as a pre-flight issue: never stored as a value (no blank writes). */
function blankTextIssue({ path, key }: t.BlankConfigText): t.ConfigIssue {
  if (key === undefined) {
    return { path, code: 'BLANK_VALUE', message: describeIssueCode('BLANK_VALUE', undefined, '') };
  }
  return {
    path,
    code: 'BLANK_KEY',
    message: describeIssueCode('BLANK_KEY', undefined, ''),
    params: { key },
  };
}

interface PlanState {
  snapshot: t.WriteSnapshot;
  sets: Map<string, t.ConfigValue>;
  resets: string[];
  tombstones: string[];
  untombstones: string[];
  entryOps: Map<string, t.EntryChange[]>;
  skipped: t.SkippedChange[];
  issues: t.ConfigIssue[];
  warnings: t.ConfigWarning[];
  effective: number;
  /** Entry identities each collection's ops touch (validated as whole entries). */
  touchedEntries: Map<string, Set<string>>;
}

function addEntryOp(state: PlanState, op: t.EntryChange): void {
  const list = state.entryOps.get(op.path) ?? [];
  list.push(op);
  state.entryOps.set(op.path, list);
  const touched = state.touchedEntries.get(op.path) ?? new Set<string>();
  touched.add(op.key);
  if (op.identity) touched.add(op.identity);
  state.touchedEntries.set(op.path, touched);
}

/** A whole-array `set` of a `byKey` collection becomes one upsert per entry (merge, not replace). */
function expandCollectionSet(
  state: PlanState,
  collection: t.KeyedCollection,
  value: t.ConfigValue[],
): void {
  const existing = mergeConfigLayers(
    getValueAtPath(state.snapshot.lower, collection.path),
    getValueAtPath(state.snapshot.stored, collection.path),
    collection.path,
  );
  const existingKeys = new Set(
    (Array.isArray(existing) ? existing : []).map((entry) => getEntryKey(entry, collection.key)),
  );
  for (const entry of value) {
    const key = getEntryKey(entry, collection.key);
    if (key === undefined) {
      state.issues.push({
        path: collection.path,
        code: 'missing_merge_key',
        message: `${collection.path}: every entry needs a ${collection.key}`,
      });
      continue;
    }
    addEntryOp(state, {
      op: 'upsertEntry',
      path: collection.path,
      key,
      identity: existingKeys.has(key) ? key : null,
      value: entry,
    });
  }
}

/** A `set` of one indexed entry (`endpoints.custom.3`) from callers without identity tracking: upsert by the entry's own key. */
function expandIndexedEntrySet(state: PlanState, path: string, value: t.ConfigValue): boolean {
  const located = findKeyedCollectionEntry(path);
  if (!located) return false;
  const { collection, rest } = located;
  const key = getEntryKey(value, collection.key);
  if (rest !== '' || key === undefined) {
    state.issues.push({
      path,
      code: 'indexed_merge_key_write',
      message: `${path}: ${collection.path} entries are saved whole, by ${collection.key}`,
    });
    return true;
  }
  const existing = mergeConfigLayers(
    getValueAtPath(state.snapshot.lower, collection.path),
    getValueAtPath(state.snapshot.stored, collection.path),
    collection.path,
  );
  const exists =
    Array.isArray(existing) && existing.some((entry) => getEntryKey(entry, collection.key) === key);
  addEntryOp(state, {
    op: 'upsertEntry',
    path: collection.path,
    key,
    identity: exists ? key : null,
    value,
  });
  return true;
}

const INDEXED_PATH_RE = /^(.+)\.(\d+)$/;

/** `{ arrayPath, index }` when `fieldPath` addresses an item of an array setting (`x.list.2`). */
export function parseIndexedArrayPath(
  fieldPath: string,
): { arrayPath: string; index: number } | null {
  const match = INDEXED_PATH_RE.exec(fieldPath);
  if (!match) return null;
  const [, arrayPath, indexStr] = match;
  const schema = resolveSubSchema(configSchema as t.ZodSchemaLike, arrayPath.split('.'));
  if (!schema || unwrapSchema(schema)?._def?.typeName !== 'ZodArray') return null;
  return { arrayPath, index: Number(indexStr) };
}

/**
 * A `set` of one item of a plain array setting becomes a `set` of the whole
 * array (the target's own array, else the one it inherits, with the item
 * replaced): a PATCH of `list.2` alone would store an object with key `2`.
 */
function expandIndexedArraySet(state: PlanState, path: string, value: t.ConfigValue): boolean {
  const parsed = parseIndexedArrayPath(path);
  if (!parsed) return false;
  const { arrayPath, index } = parsed;
  const pending = state.sets.get(arrayPath);
  const source =
    pending ??
    getValueAtPath(state.snapshot.stored, arrayPath) ??
    getValueAtPath(state.snapshot.lower, arrayPath);
  const next = Array.isArray(source) ? [...source] : [];
  next[index] = value;
  if (pending === undefined) state.effective++;
  state.sets.set(arrayPath, next);
  return true;
}

function collectOps(state: PlanState, ops: t.ConfigChange[]): void {
  const isProfile = state.snapshot.lowerKind === 'inherited';
  for (const op of ops) {
    const isRemoval = op.op === 'reset' || op.op === 'untombstone' || op.op === 'removeEntry';
    const reason =
      getWriteSkipReason(op.path, isRemoval) ??
      (isProfile && !isRemoval ? scopeGateSkipReason(op.path) : undefined);
    if (reason) {
      state.skipped.push({ fieldPath: op.path, reason });
      continue;
    }
    if (op.op === 'set') collectSet(state, op.path, op.value);
    else if (op.op === 'upsertEntry' || op.op === 'removeEntry') addEntryOp(state, op);
    else if (op.op === 'reset') state.resets.push(op.path);
    else if (op.op === 'tombstone') state.tombstones.push(op.path);
    else state.untombstones.push(op.path);
  }
}

function collectSet(state: PlanState, path: string, value: t.ConfigValue): void {
  const collection = getKeyedCollection(path);
  if (collection?.merge === 'byKey' && Array.isArray(value)) {
    expandCollectionSet(state, collection, value);
    return;
  }
  if (expandIndexedEntrySet(state, path, value) || expandIndexedArraySet(state, path, value)) {
    return;
  }
  state.sets.set(path, value);
  state.effective++;
}

function resolveCollections(state: PlanState): void {
  for (const [path, list] of state.entryOps) {
    const collection = getKeyedCollection(path);
    if (!collection) {
      state.issues.push({
        path,
        code: 'NOT_A_COLLECTION',
        message: `${path} is not a keyed collection`,
      });
      continue;
    }
    const resolution = resolveCollectionOps({
      collection,
      stored: getValueAtPath(state.snapshot.stored, path),
      lower: getValueAtPath(state.snapshot.lower, path),
      lowerKind: state.snapshot.lowerKind,
      ops: list,
    });
    state.issues.push(...resolution.issues);
    state.warnings.push(...resolution.warnings);
    state.effective += resolution.effective;
    if (!resolution.changed) continue;
    if (resolution.next !== undefined) state.sets.set(path, resolution.next);
    else state.resets.push(path);
  }
}

function isScalarValue(value: t.ConfigValue): boolean {
  return value !== undefined && !Array.isArray(value) && !isConfigRecord(value);
}

/**
 * The ancestor a set must be written through: another set in the batch (a
 * `boolean | object` switch turned on, then one of its settings), or a stored
 * scalar (`schedules: false`), which the admin API cannot write a key into.
 */
function findSetHolder(state: PlanState, path: string): string | undefined {
  for (let dot = path.indexOf('.'); dot > 0; dot = path.indexOf('.', dot + 1)) {
    const ancestor = path.slice(0, dot);
    if (state.sets.has(ancestor)) {
      return Array.isArray(state.sets.get(ancestor)) ? undefined : ancestor;
    }
    if (isScalarValue(getValueAtPath(state.snapshot.stored, ancestor))) return ancestor;
  }
  return undefined;
}

/**
 * Folds each set beneath another set or a stored scalar into one set of that
 * ancestor, as an object (`schedules: true` + `schedules.maxPerUser: 5` →
 * `schedules: { maxPerUser: 5 }`): LibreChat reads an object as enabled.
 */
function foldNestedSets(state: PlanState): void {
  const byDepth = [...state.sets.keys()].sort((a, b) => a.split('.').length - b.split('.').length);
  for (const path of byDepth) {
    const holder = findSetHolder(state, path);
    if (!holder) continue;
    const current = state.sets.get(holder);
    const record = isConfigRecord(current) ? current : {};
    const rest = path.slice(holder.length + 1);
    state.sets.set(holder, setValueAtPath(record, rest, state.sets.get(path)));
    state.sets.delete(path);
  }
}

function hasAncestorIn(path: string, paths: Iterable<string>): boolean {
  for (const other of paths) {
    if (path !== other && path.startsWith(`${other}.`)) return true;
  }
  return false;
}

/**
 * Resets are applied after sets, so a reset of a path that also has new
 * descendant values (an entry replaced with different fields, a rename onto
 * the same name) becomes one `set` of the whole new value, and resets under
 * a path being set are dropped (the set replaces that subtree anyway).
 */
function foldResets(state: PlanState): void {
  const resets = [...new Set(state.resets)].filter((path) => !hasAncestorIn(path, state.resets));
  const kept: string[] = [];
  for (const reset of resets) {
    if (state.sets.has(reset) || hasAncestorIn(reset, state.sets.keys())) continue;
    const prefix = `${reset}.`;
    const descendants = [...state.sets.keys()].filter((path) => path.startsWith(prefix));
    if (descendants.length === 0) {
      kept.push(reset);
      continue;
    }
    let combined: t.ConfigRecord = {};
    for (const path of descendants) {
      combined = setValueAtPath(combined, path.slice(prefix.length), state.sets.get(path));
      state.sets.delete(path);
    }
    state.sets.set(reset, combined);
  }
  state.resets = kept;
}

/**
 * Only an override the target holds can be removed (D3): a reset of a value
 * that comes from the layer beneath is reported as `yamlValue` and never
 * sent, and a reset of nothing at all is dropped.
 */
function dropNoopResets(state: PlanState): void {
  const { stored, lower } = state.snapshot;
  state.resets = state.resets.filter((path) => {
    if (valueOrSecretPreview(stored, path) !== undefined) {
      state.effective++;
      return true;
    }
    if (getValueAtPath(lower, path) !== undefined) {
      const reason = state.snapshot.lowerKind === 'inherited' ? 'inheritedValue' : 'yamlValue';
      state.skipped.push({ fieldPath: path, reason });
    }
    return false;
  });
}

function parentPath(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf('.')));
}

/**
 * The highest ancestor a removal leaves empty, so no `{}` remains stored: a
 * parent whose only key is the emptied child (`endpoints.anthropic.models`
 * after its last key goes, then `endpoints.anthropic`, then `endpoints`).
 */
function emptiedAncestor(storedAfter: t.ConfigRecord, path: string): string {
  let current = path;
  const leftEmpty = getValueAtPath(storedAfter, current);
  if (isConfigRecord(leftEmpty) && Object.keys(leftEmpty).length > 0) return current;
  let parent = parentPath(current);
  while (parent) {
    const value = getValueAtPath(storedAfter, parent);
    const child = current.slice(parent.length + 1);
    if (!isConfigRecord(value) || Object.keys(value).some((key) => key !== child)) break;
    current = parent;
    parent = parentPath(current);
  }
  return current;
}

/** Removes `path` from stored overrides, with a secret's preview companion (LibreChat removes both). */
function removeStored(stored: t.ConfigRecord, path: string): t.ConfigRecord {
  const removed = removeValueAtPath(stored, path);
  const dot = path.lastIndexOf('.');
  const key = path.slice(dot + 1);
  if (!isRedactedKey(key)) return removed;
  return removeValueAtPath(removed, `${path.slice(0, dot + 1)}${toSecretPreviewKey(key)}`);
}

function applyToStored(state: PlanState): t.ConfigRecord {
  let stored = state.snapshot.stored;
  for (const [path, value] of state.sets) stored = setValueAtPath(stored, path, value);
  for (const path of [...state.resets, ...state.tombstones]) stored = removeStored(stored, path);
  return stored;
}

/** Widens each reset to the highest parent it leaves empty, then returns the stored overrides afterwards. */
function pruneEmptyParents(state: PlanState): t.ConfigRecord {
  const removed = applyToStored(state);
  const widened = state.resets.map((path) => emptiedAncestor(removed, path));
  state.resets = [...new Set(widened)].filter((path) => !hasAncestorIn(path, widened));
  return applyToStored(state);
}

function issueKey(issue: t.ConfigIssue): string {
  return `${issue.path}|${issue.code ?? ''}|${issue.entryIdentity ?? ''}`;
}

function validateCollectionSet(
  state: PlanState,
  collection: t.KeyedCollection,
  value: t.ConfigValue[],
): t.ConfigIssue[] {
  const touched = state.touchedEntries.get(collection.path);
  const lowerEntries = getValueAtPath(state.snapshot.lower, collection.path);
  const lowerList = Array.isArray(lowerEntries) ? lowerEntries : [];
  const storedEntries = getValueAtPath(state.snapshot.stored, collection.path);
  const storedKeys = new Set(
    (Array.isArray(storedEntries) ? storedEntries : [])
      .filter((entry) => hasHiddenSecret(entry, collection))
      .map((entry) => getEntryKey(entry, collection.key)),
  );
  return value.flatMap((entry, index) => {
    const identity = getEntryKey(entry, collection.key);
    if (touched && (identity === undefined || !touched.has(identity))) return [];
    const lowerEntry =
      collection.merge === 'byKey'
        ? lowerList.find((candidate) => getEntryKey(candidate, collection.key) === identity)
        : undefined;
    const merged = mergeConfigLayers(lowerEntry, entry);
    const issues = validateEntry(collection.path, merged, index, identity);
    /** The layer beneath owns its entries (and its literal keys are redacted on read): check only the target's own. */
    if (collection.path !== 'endpoints.custom' || lowerEntry !== undefined) return issues;
    return [
      ...issues,
      ...validateLoadableEndpoint(merged, index, identity, storedKeys.has(identity)),
    ];
  });
}

/**
 * Blank text in a collection's list counts only in the entries this batch
 * touches: an entry stored earlier (and not edited now) never blocks an
 * unrelated save.
 */
function isIntroducedIssue(state: PlanState, path: string, issue: t.ConfigIssue): boolean {
  if (!issue.code || !BLANK_TEXT_CODES.has(issue.code) || issue.entryIdentity === undefined) {
    return true;
  }
  const touched = state.touchedEntries.get(path);
  return touched === undefined || touched.has(issue.entryIdentity);
}

/** Validates every set; returns the paths a write rule blocks outright. */
function validateSets(state: PlanState): Set<string> {
  const blocked = new Set<string>();
  for (const [path, value] of state.sets) {
    const ruleIssues = findWriteRuleIssues(path, value).filter((issue) =>
      isIntroducedIssue(state, path, issue),
    );
    if (ruleIssues.length > 0) {
      state.issues.push(...ruleIssues);
      blocked.add(path);
      continue;
    }
    const collection = getKeyedCollection(path);
    state.issues.push(
      ...(collection && Array.isArray(value)
        ? validateCollectionSet(state, collection, value)
        : validateField(path, value)),
    );
  }
  return blocked;
}

function isInCollection(path: string): boolean {
  return findKeyedCollectionEntry(path) !== undefined;
}

/**
 * Whole-section validation of the merged result (lower layer + overrides
 * after the write), so refinements and required siblings are checked. An
 * issue is reported when the write introduced it, or when it lies at or
 * under a written path; issues the configuration already had elsewhere do
 * not block an unrelated write. Collection entries are validated per entry.
 */
function validateSections(state: PlanState, blocked: ReadonlySet<string>): void {
  let storedAfter = state.snapshot.stored;
  for (const [path, value] of state.sets) {
    if (!blocked.has(path)) storedAfter = setValueAtPath(storedAfter, path, value);
  }
  for (const path of [...state.resets, ...state.tombstones]) {
    storedAfter = removeStored(storedAfter, path);
  }
  const written = [
    ...[...state.sets.keys()].filter((path) => !blocked.has(path)),
    ...state.resets,
    ...state.tombstones,
  ];
  /** LibreChat reads librechat.yaml-only sections from the file alone: removing an override there can't break them. */
  const sections = new Set(
    written.filter((path) => getReadOnlyReason(path) !== 'yamlOnly').map(getConfigSection),
  );
  const reported = new Set(state.issues.map(issueKey));
  const { lower, stored } = state.snapshot;
  for (const section of sections) {
    const before = mergeConfigLayers(lower[section], stored[section], section);
    const after = mergeConfigLayers(lower[section], storedAfter[section], section);
    const existing = new Set(validateSection(section, before).map(issueKey));
    for (const issue of validateSection(section, after)) {
      if (isInCollection(issue.path) || reported.has(issueKey(issue))) continue;
      const underWrite = written.some(
        (path) => issue.path === path || issue.path.startsWith(`${path}.`),
      );
      if (existing.has(issueKey(issue)) && !underWrite) continue;
      reported.add(issueKey(issue));
      state.issues.push(issue);
    }
  }
}

/**
 * Keys of a whole object written over a lower-layer object that the write
 * leaves out: LibreChat merges objects key by key, so those keys come back
 * (e.g. a librechat.yaml MCP header removed in the panel).
 */
function findMergedBackKeys(state: PlanState): void {
  for (const [path, value] of state.sets) {
    if (!isConfigRecord(value) || getKeyedCollection(path)) continue;
    const lowerValue = getValueAtPath(state.snapshot.lower, path);
    if (!isConfigRecord(lowerValue)) continue;
    const keys = diffOverride(lowerValue, value).unremovable.filter(
      (key) => !SECRET_CONFIG_KEYS.has(key.slice(key.lastIndexOf('.') + 1)),
    );
    if (keys.length > 0) state.warnings.push({ path, warning: 'yamlOnly', keys });
  }
}

/**
 * Resolves a batch of changes against the target's stored overrides and the
 * layer beneath it, into the admin API writes that implement it. Everything
 * is checked before anything may be written: write rules (read-only and
 * YAML-managed paths, process-backed MCP fields, unsafe keys), field and
 * entry schemas, whole sections, and the keyed collection rules. The client
 * runs it for the review and inline errors; the server runs it again against
 * freshly read layers right before writing.
 */
export function planConfigChanges(ops: t.ConfigChange[], snapshot: t.WriteSnapshot): t.WritePlan {
  const state: PlanState = {
    snapshot,
    sets: new Map(),
    resets: [],
    tombstones: [],
    untombstones: [],
    entryOps: new Map(),
    skipped: [],
    issues: [],
    warnings: [],
    effective: 0,
    touchedEntries: new Map(),
  };
  collectOps(state, ops);
  resolveCollections(state);
  foldNestedSets(state);
  foldResets(state);
  dropNoopResets(state);
  state.effective += state.tombstones.length + state.untombstones.length;
  const storedAfter = pruneEmptyParents(state);
  validateSections(state, validateSets(state));
  findMergedBackKeys(state);
  return {
    sets: [...state.sets].map(([fieldPath, value]) => ({ fieldPath, value })),
    resets: state.resets,
    tombstones: state.tombstones,
    untombstones: state.untombstones,
    skipped: state.skipped,
    issues: state.issues,
    warnings: state.warnings,
    storedAfter,
    effective: state.effective,
  };
}

/** Keys the admin API redacts on read (secrets and their preview companions). */
function isRedactedKey(key: string): boolean {
  return isSecretKey(key) || key.endsWith('Preview');
}

function stripSecrets(value: t.ConfigValue): t.ConfigValue {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!isConfigRecord(value)) return value;
  const result: t.ConfigRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isRedactedKey(key)) result[key] = stripSecrets(child);
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

/** Leaf paths (relative) and values of a value; arrays are leaves, secrets are skipped. */
function leavesOf(value: t.ConfigValue, prefix = ''): Array<[string, t.ConfigValue]> {
  if (!isConfigRecord(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    isRedactedKey(key) ? [] : leavesOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function joinPath(base: string, rest: string): string {
  return rest ? `${base}.${rest}` : base;
}

/** Whether every leaf written at `path` shows in the effective config, or some still show the lower value. */
function lacksEffect(
  path: string,
  value: t.ConfigValue,
  snapshot: t.WriteSnapshot,
  effective: t.ConfigRecord,
): boolean {
  return leavesOf(value).some(([rest, leaf]) => {
    const leafPath = joinPath(path, rest);
    const actual = getValueAtPath(effective, leafPath);
    const lowerLeaf = getValueAtPath(snapshot.lower, leafPath);
    if (lowerLeaf === undefined || isConfigValueEqual(actual, leaf)) return false;
    return isConfigValueEqual(actual, lowerLeaf);
  });
}

function collectionLacksEffect(
  collection: t.KeyedCollection,
  entries: t.ConfigValue[],
  effective: t.ConfigRecord,
): string[] {
  const live = getValueAtPath(effective, collection.path);
  const liveEntries = Array.isArray(live) ? live : [];
  return entries.flatMap((entry) => {
    const identity = getEntryKey(entry, collection.key);
    const actual = liveEntries.find((item) => getEntryKey(item, collection.key) === identity);
    const missing =
      actual === undefined ||
      leavesOf(entry).some(
        ([rest, leaf]) => !isConfigValueEqual(getValueAtPath(actual, rest), leaf),
      );
    return missing ? [`${collection.path} › ${identity ?? '?'}`] : [];
  });
}

/**
 * After a write: every change that did not take effect, and why. A stored
 * value that differs from what was sent (LibreChat dropped keys or a whole
 * section) is `notStored`; with the effective config (base target), a value
 * that still reads as the lower layer's is `notApplied`; and keys a merge
 * brings back from the lower layer (`yamlOnly` warnings) are `yamlMerged`.
 */
export function verifyWrite(
  plan: t.WritePlan,
  snapshot: t.WriteSnapshot,
  storedActual: t.ConfigRecord,
  effective?: t.ConfigRecord,
): t.SkippedChange[] {
  const result: t.SkippedChange[] = [];
  const flagged = new Set<string>();
  const flag = (fieldPath: string, reason: t.SkipReason) => {
    if (flagged.has(fieldPath)) return;
    flagged.add(fieldPath);
    result.push({ fieldPath, reason });
  };
  for (const { fieldPath, value } of plan.sets) {
    if (isRedactedKey(fieldPath.slice(fieldPath.lastIndexOf('.') + 1))) continue;
    const intended = stripSecrets(getValueAtPath(plan.storedAfter, fieldPath));
    const stored = stripSecrets(getValueAtPath(storedActual, fieldPath));
    if (!isConfigValueEqual(intended, stored)) {
      flag(fieldPath, 'notStored');
      continue;
    }
    if (!effective) continue;
    const collection = getKeyedCollection(fieldPath);
    if (collection && Array.isArray(value)) {
      if (collection.merge === 'byKey') {
        collectionLacksEffect(collection, value, effective).forEach((path) =>
          flag(path, 'notApplied'),
        );
      }
      continue;
    }
    if (lacksEffect(fieldPath, value, snapshot, effective)) flag(fieldPath, 'notApplied');
  }
  for (const path of plan.resets) {
    if (getValueAtPath(storedActual, path) !== undefined) flag(path, 'notStored');
  }
  for (const { fieldPath, reason } of mergedBackChanges(plan.warnings, snapshot)) {
    flag(fieldPath, reason);
  }
  return result;
}

/** `endpoints.custom.<n>`: where an entry sits in the list the page (and its labels) read. */
function entryPathOf(path: string, identity: string, snapshot?: t.WriteSnapshot): string {
  const collection = getKeyedCollection(path);
  if (!collection || !snapshot) return path;
  const merged = mergeConfigLayers(
    getValueAtPath(snapshot.lower, path),
    getValueAtPath(snapshot.stored, path),
    path,
  );
  const index = Array.isArray(merged)
    ? merged.findIndex((entry) => getEntryKey(entry, collection.key) === identity)
    : -1;
  return index < 0 ? path : `${path}.${index}`;
}

/**
 * The lower-layer keys a write leaves out but LibreChat merges back, one change
 * per key: `yamlMerged` for Base, `inheritedMerged` for a profile (the keys
 * come from Base). Entry keys are dot-paths through the entry's position in
 * the merged list (`endpoints.custom.3.models.fetch`), so labels resolve to
 * "Custom endpoints › Moonshot › Fetch model list"; without the snapshot the
 * position is unknown and the path stops at the collection.
 */
export function mergedBackChanges(
  warnings: t.ConfigWarning[],
  snapshot?: t.WriteSnapshot,
): t.SkippedChange[] {
  const reason = snapshot?.lowerKind === 'inherited' ? 'inheritedMerged' : 'yamlMerged';
  return warnings.flatMap((warning) => {
    if (warning.warning !== 'yamlOnly') return [];
    const identity = warning.entryIdentity;
    const holder = identity ? entryPathOf(warning.path, identity, snapshot) : warning.path;
    return (warning.keys ?? []).map((key) => ({
      fieldPath: `${holder}.${key}`,
      reason,
      entryIdentity: identity,
      entryPath: identity ? key : undefined,
    }));
  });
}
