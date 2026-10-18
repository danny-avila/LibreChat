import type * as t from '~/admin/types';
import { hasPathOrAncestor, pathIndexOverlaps } from './paths';
import { getValueAtPath, isConfigRecord } from './format';
import { getReadOnlyReason } from '~/admin/constants';
import { toSecretPreviewKey } from './secrets';
import { ARRAY_MERGE_KEYS } from './layers';

/**
 * Value a field control shows: a pending edit first, then the merged tree
 * (`fallback`). The scope's saved leaves (`resolvedValues`) are only used when
 * nothing under the path is pending — they are the stale saved array for a
 * collection whose entries are being edited.
 */
export function resolveFieldValue(
  path: string,
  fallback: t.ConfigValue,
  editedValues: t.FlatConfigMap,
  resolvedValues: t.FlatConfigMap | null | undefined,
  schemaDefaults: t.FlatConfigMap | undefined,
): t.ConfigValue {
  if (path in editedValues) {
    if (editedValues[path] === undefined) return schemaDefaults?.[path] ?? fallback;
    return editedValues[path];
  }
  if (!resolvedValues || !(path in resolvedValues)) return fallback;
  const prefix = `${path}.`;
  for (const editPath of Object.keys(editedValues)) {
    if (editPath.startsWith(prefix)) return fallback;
  }
  return resolvedValues[path];
}

const NO_VALUES_STATE: t.FieldState = {
  value: undefined,
  effective: undefined,
  source: 'default',
  isConfigured: false,
  isOverride: false,
  isEdited: false,
  isPendingReset: false,
  isHidden: false,
};

/** Title settings LibreChat reads from `endpoints.all` as a whole block whenever one exists. */
const BLOCK_SHADOWED_KEYS: ReadonlySet<string> = new Set([
  'titleConvo',
  'titleModel',
  'titleMethod',
  'titleEndpoint',
  'titlePrompt',
  'titlePromptTemplate',
]);

/** Activity and reasoning-label settings where a value in `endpoints.all` wins per field. */
const FIELD_SHADOWED_KEYS: ReadonlySet<string> = new Set([
  'activityLabel',
  'activityModel',
  'activityEndpoint',
  'activityPrompt',
  'activityMaxPerRun',
  'activityCharLimit',
  'activityPhaseLabel',
  'activityPhaseModel',
  'activityPhaseEndpoint',
  'activityPhasePrompt',
  'activityPhaseMaxPerRun',
  'reasoningLabel',
  'reasoningLabelModel',
  'reasoningLabelEndpoint',
  'reasoningLabelPrompt',
  'reasoningLabelMinChars',
  'reasoningLabelUpdateChars',
  'reasoningLabelUpdateIntervalMs',
  'reasoningLabelMaxPerRun',
]);

const INDEX_SEGMENT = /^\d+$/;

/** Whether two config values match (object key order counts; good enough for defaults). */
function sameValue(a: t.ConfigValue, b: t.ConfigValue): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The `endpoints.all` setting that takes precedence over a provider or custom
 * endpoint field (EV-8). Titles read the whole `all` block whenever one exists
 * (`endpoints.all ?? endpoints[x]`), so every per-endpoint title setting is
 * ignored, even one that `all` leaves unset. Activity and reasoning-label
 * settings resolve per field (`all[key] ?? endpoint[key]`).
 */
export function resolveShadowedBy(
  path: string,
  root: t.ConfigValue,
  editedValues: t.FlatConfigMap = {},
): t.ShadowedBy | undefined {
  const segments = path.split('.');
  if (segments[0] !== 'endpoints') return undefined;
  const key = segments[segments.length - 1];
  const isProviderField =
    segments.length === 3 && segments[1] !== 'all' && segments[1] !== 'custom';
  const isCustomField =
    segments.length === 4 && segments[1] === 'custom' && INDEX_SEGMENT.test(segments[2]);
  if (!isProviderField && !isCustomField) return undefined;
  const isBlock = BLOCK_SHADOWED_KEYS.has(key);
  if (!isBlock && !FIELD_SHADOWED_KEYS.has(key)) return undefined;
  const all = getValueAtPath(root, 'endpoints.all');
  if (!isConfigRecord(all)) return undefined;
  const allPath = `endpoints.all.${key}`;
  const value = allPath in editedValues ? editedValues[allPath] : all[key];
  if (isBlock) return { path: allPath, value, precedence: 'block' };
  return value === undefined ? undefined : { path: allPath, value, precedence: 'field' };
}

interface BaseReadout {
  /** The value Base users get. */
  effective: t.ConfigValue;
  source: t.ProvenanceSource;
  /** Set by librechat.yaml, a base override or a base tombstone. */
  isConfigured: boolean;
  isOverride: boolean;
  isHidden: boolean;
  /** What removing the base override leaves: librechat.yaml, a runtime default or the schema default. */
  lower: t.RevertTarget;
  stack: t.FieldLayer[];
}

/** An entry of a keyed list (`endpoints.custom`), which LibreChat merges by key across layers. */
interface KeyedLocation {
  arrayPath: string;
  keyField: string;
  key: t.ConfigValue;
  /** The path inside the entry ('' for the entry itself). */
  rest: string;
}

/** Reads one path from every layer: by path, or by entry key inside keyed lists. */
interface PathReader {
  /** The path without array indices inside keyed lists, for schema lookups. */
  schemaPath: string;
  valueIn: (root: t.ConfigValue) => t.ConfigValue;
  /** Whether a layer sets the path (or something inside it). */
  sets: (root: t.ConfigValue, index: t.PathIndex) => boolean;
}

/**
 * Where `path` points inside a keyed list, identified by the entry's key in
 * the displayed tree (indices differ between layers; names do not).
 */
function locateKeyed(path: string, displayRoot: t.ConfigValue): KeyedLocation | null {
  for (const [arrayPath, keyField] of Object.entries(ARRAY_MERGE_KEYS)) {
    if (!path.startsWith(`${arrayPath}.`)) continue;
    const tail = path.slice(arrayPath.length + 1);
    const dot = tail.indexOf('.');
    const index = dot === -1 ? tail : tail.slice(0, dot);
    if (!INDEX_SEGMENT.test(index)) return null;
    const entry = getValueAtPath(displayRoot, `${arrayPath}.${index}`);
    if (!isConfigRecord(entry) || entry[keyField] == null) return null;
    return {
      arrayPath,
      keyField,
      key: entry[keyField],
      rest: dot === -1 ? '' : tail.slice(dot + 1),
    };
  }
  return null;
}

/** `models.apiKey` → `models.apiKeyPreview`: where the API puts a redacted secret's preview. */
function toSecretPreviewKeyPath(rest: string): string {
  const dot = rest.lastIndexOf('.');
  return `${rest.slice(0, dot + 1)}${toSecretPreviewKey(rest.slice(dot + 1))}`;
}

function keyedValue(root: t.ConfigValue, location: KeyedLocation): t.ConfigValue {
  const list = getValueAtPath(root, location.arrayPath);
  if (!Array.isArray(list)) return undefined;
  const entry = list.find(
    (item) => isConfigRecord(item) && item[location.keyField] === location.key,
  );
  return location.rest ? getValueAtPath(entry, location.rest) : entry;
}

function createReader(path: string, displayRoot: t.ConfigValue): PathReader {
  const location = locateKeyed(path, displayRoot);
  if (!location) {
    return {
      schemaPath: path,
      valueIn: (root) => getValueAtPath(root, path),
      /** A leaf above `path` sets it only when it holds a value there (a list does, `schedules: true` does not). */
      sets: (root, index) =>
        index.ancestors.has(path) ||
        index.paths.has(path) ||
        (pathIndexOverlaps(index, path) && getValueAtPath(root, path) !== undefined),
    };
  }
  /** A redacted secret is returned as its preview companion (`apiKey` → `apiKeyPreview`). */
  const preview = location.rest
    ? { ...location, rest: toSecretPreviewKeyPath(location.rest) }
    : null;
  return {
    schemaPath: location.rest ? `${location.arrayPath}.${location.rest}` : location.arrayPath,
    valueIn: (root) => keyedValue(root, location),
    sets: (root) =>
      keyedValue(root, location) !== undefined ||
      (preview != null && keyedValue(root, preview) !== undefined),
  };
}

/** The layers under any override: schema default, what LibreChat fills in, librechat.yaml. */
function readLowerLayers(
  path: string,
  layers: t.ValueLayers,
  reader: PathReader,
  stack: t.FieldLayer[],
): { lower: t.RevertTarget; yamlSets: boolean } {
  const schemaDefault = layers.schemaDefaults[path] ?? layers.schemaDefaults[reader.schemaPath];
  const yamlValue = reader.valueIn(layers.yamlEffective);
  const yamlSets = reader.sets(layers.yamlEffective, layers.yamlPaths);
  const synthesized =
    !yamlSets && yamlValue !== undefined && !sameValue(yamlValue, schemaDefault)
      ? yamlValue
      : layers.runtimeDefaultAt?.(path);
  if (schemaDefault !== undefined) stack.push({ source: 'default', value: schemaDefault });
  if (synthesized !== undefined) stack.push({ source: 'runtimeDefault', value: synthesized });
  if (yamlSets) {
    stack.push({ source: 'yaml', value: yamlValue });
    return { lower: { value: yamlValue, source: 'yaml' }, yamlSets };
  }
  if (synthesized !== undefined) {
    return { lower: { value: synthesized, source: 'runtimeDefault' }, yamlSets };
  }
  return { lower: { value: schemaDefault, source: 'default' }, yamlSets };
}

/** The default that applies once a value is removed outright (tombstoned). */
function defaultAt(path: string, layers: t.ValueLayers): t.ConfigValue {
  return layers.runtimeDefaultAt?.(path) ?? layers.schemaDefaults[path];
}

/** What Base users get at `path`, and from which layer. */
function readBase(path: string, layers: t.ValueLayers, reader: PathReader): BaseReadout {
  const stack: t.FieldLayer[] = [];
  const { lower, yamlSets } = readLowerLayers(path, layers, reader, stack);
  const isOverride = reader.sets(layers.baseOverrides, layers.baseOverridePaths);
  const isHidden = !isOverride && hasPathOrAncestor(layers.baseTombstones, path);
  const baseValue = reader.valueIn(layers.base);
  if (isOverride) stack.push({ source: 'admin', value: baseValue });
  if (isHidden) stack.push({ source: 'admin', value: undefined, hidden: true });
  const effective = baseValue ?? (isHidden ? defaultAt(path, layers) : lower.value);
  let source: t.ProvenanceSource = lower.source;
  if (isOverride || isHidden) {
    source = 'admin';
  } else if (!yamlSets && baseValue !== undefined && lower.source === 'default') {
    source = sameValue(baseValue, lower.value) ? 'default' : 'runtimeDefault';
  }
  return {
    effective,
    source,
    isConfigured: yamlSets || isOverride || isHidden,
    isOverride,
    isHidden,
    lower,
    stack,
  };
}

/** Whether a change is pending at `path`, and what the control shows for it. */
function readPending(
  path: string,
  editedValues: t.FlatConfigMap,
  revertValue: t.ConfigValue,
): { isEdited: boolean; isPendingReset: boolean; value: t.ConfigValue } {
  if (!(path in editedValues)) return { isEdited: false, isPendingReset: false, value: undefined };
  const edited = editedValues[path];
  if (edited === undefined) return { isEdited: true, isPendingReset: true, value: revertValue };
  return { isEdited: true, isPendingReset: false, value: edited };
}

function deriveBaseModeState(
  path: string,
  data: t.ConfigValuesData,
  layers: t.ValueLayers,
): t.FieldState {
  const reader = createReader(path, data.configValues ?? layers.effective);
  const base = readBase(path, layers, reader);
  const revertTarget = base.isOverride || base.isHidden ? base.lower : undefined;
  const revertValue = revertTarget ? revertTarget.value : base.effective;
  const pending = readPending(path, data.editedValues, revertValue);
  /** D5: LibreChat reads this section only from librechat.yaml, so a stored override has no effect. */
  if (base.isOverride && getReadOnlyReason(path) === 'yamlOnly') {
    return {
      value: pending.isEdited ? pending.value : base.lower.value,
      effective: base.lower.value,
      source: base.lower.source,
      revertTarget: base.lower,
      isConfigured: base.isConfigured,
      isOverride: true,
      isEdited: pending.isEdited,
      isPendingReset: pending.isPendingReset,
      isHidden: false,
      ignoredOverride: true,
      stack: base.stack,
    };
  }
  const shown = getValueAtPath(data.configValues, path);
  const shadowedBy = resolveShadowedBy(
    path,
    data.configValues ?? layers.effective,
    data.editedValues,
  );
  return {
    value: pending.isEdited ? pending.value : (shown ?? base.effective),
    effective: base.effective,
    source: base.source,
    ...(revertTarget && { revertTarget }),
    isConfigured: base.isConfigured || (data.configuredPaths?.has(path) ?? false),
    isOverride: base.isOverride,
    isEdited: pending.isEdited,
    isPendingReset: pending.isPendingReset,
    isHidden: base.isHidden,
    ...(shadowedBy && { shadowedBy }),
    stack: base.stack,
  };
}

function deriveScopeModeState(
  path: string,
  data: t.ConfigValuesData,
  layers: t.ValueLayers,
  scope: t.ScopeLayer,
): t.FieldState {
  const reader = createReader(path, data.configValues ?? layers.effective);
  const base = readBase(path, layers, reader);
  const inherited: t.RevertTarget = { value: base.effective, source: base.source };
  const isOverride = reader.sets(scope.overrides, scope.overridePaths);
  const visibility = data.visibilityEdits?.[path];
  const isHidden = visibility
    ? visibility === 'hide'
    : !isOverride && hasPathOrAncestor(scope.tombstones, path);
  const merged = reader.valueIn(layers.effective);
  const effective = merged ?? (isHidden ? defaultAt(path, layers) : inherited.value);
  const stack = [...base.stack];
  if (isOverride) stack.push({ source: 'scope', value: merged });
  if (isHidden) stack.push({ source: 'scope', value: undefined, hidden: true });
  const ownsValue = isOverride || isHidden;
  const revertTarget: t.RevertTarget | undefined = ownsValue
    ? { value: inherited.value, source: 'inherited' }
    : undefined;
  const pending = readPending(path, data.editedValues, ownsValue ? inherited.value : effective);
  const shown = getValueAtPath(data.configValues, path);
  const shadowedBy = resolveShadowedBy(
    path,
    data.configValues ?? layers.effective,
    data.editedValues,
  );
  return {
    value: pending.isEdited ? pending.value : (shown ?? effective),
    effective,
    source: ownsValue ? 'scope' : 'inherited',
    ...(revertTarget && { revertTarget }),
    isConfigured: ownsValue,
    isOverride,
    isEdited: pending.isEdited || visibility != null,
    isPendingReset: pending.isPendingReset,
    isHidden,
    ...(visibility && { visibilityEdit: visibility }),
    ...(shadowedBy && { shadowedBy }),
    inherited,
    stack,
  };
}

/** Provenance from the path sets alone, for callers without the layer model. */
function resolveLegacyProvenance(
  data: t.ConfigValuesData,
  isOverride: boolean,
  isConfigured: boolean,
): t.ProvenanceSource {
  if (isOverride) return data.isEditingScope ? 'scope' : 'admin';
  if (data.isEditingScope) return 'inherited';
  return isConfigured ? 'yaml' : 'default';
}

function deriveLegacyState(path: string, data: t.ConfigValuesData): t.FieldState {
  const treeValue = getValueAtPath(data.configValues, path);
  const isOverride = data.overridePaths?.has(path) ?? false;
  const isConfigured = data.configuredPaths?.has(path) ?? false;
  return {
    value: resolveFieldValue(
      path,
      treeValue,
      data.editedValues,
      data.resolvedValues,
      data.schemaDefaults,
    ),
    effective: treeValue === undefined ? data.schemaDefaults?.[path] : treeValue,
    source: resolveLegacyProvenance(data, isOverride, isConfigured),
    isConfigured,
    isOverride,
    isEdited: path in data.editedValues,
    isPendingReset: data.pendingResets?.has(path) ?? false,
    isHidden: false,
  };
}

/**
 * `FieldState` for a path from the page's value layers (EV-1, EV-4, EV-5).
 *
 * Base mode: the effective value is librechat.yaml plus the base overrides.
 * Its source is the highest layer that sets it (admin override,
 * librechat.yaml, a value LibreChat fills in at startup, or the schema
 * default), and a base override reverts to the next layer down
 * (`yamlEffective`, else the default).
 *
 * Profile mode: the profile's own override (or tombstone) wins, otherwise the
 * field inherits Base. An override reverts to the inherited Base value.
 *
 * `value` is what the control shows: the pending edit (a pending reset shows
 * its revert target), else the displayed tree, else the effective value.
 */
export function deriveFieldState(path: string, data: t.ConfigValuesData | null): t.FieldState {
  if (!data) return NO_VALUES_STATE;
  const layers = data.layers;
  if (!layers) return deriveLegacyState(path, data);
  if (layers.scope) return deriveScopeModeState(path, data, layers, layers.scope);
  return deriveBaseModeState(path, data, layers);
}

/**
 * Value for `getValue(path, fallback)` callers: the field state's value, else
 * the caller's fallback (e.g. an empty record for a collection renderer). A
 * pending reset always shows its revert target, even when that is unset.
 */
export function deriveFieldValue(
  path: string,
  fallback: t.ConfigValue,
  data: t.ConfigValuesData | null,
): t.ConfigValue {
  const state = deriveFieldState(path, data);
  return state.isPendingReset || state.ignoredOverride ? state.value : (state.value ?? fallback);
}

/**
 * What `path` falls back to without the edit target's own override, and from
 * which layer (EV-4): in base mode librechat.yaml, else what LibreChat fills
 * in, else the schema default; in a profile what Base gives. Keyed list
 * entries (`endpoints.custom.3`) are found by name in the effective tree.
 * Undefined when nothing beneath sets a value. The change review reads it.
 */
export function revertTargetAt(path: string, layers: t.ValueLayers): t.RevertTarget | undefined {
  const reader = createReader(path, layers.effective);
  const target: t.RevertTarget = layers.scope
    ? { value: readBase(path, layers, reader).effective, source: 'inherited' }
    : readLowerLayers(path, layers, reader, []).lower;
  return target.value === undefined ? undefined : target;
}
