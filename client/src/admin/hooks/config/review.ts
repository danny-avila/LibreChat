import { useMemo, useCallback, useRef, useEffect } from 'react';
import type * as t from '~/admin/types';
import {
  notifyUndo,
  revertTargetAt,
  getEntryKey,
  getKeyedCollection,
  overriddenEntryKeys,
  resolveShadowedBy,
  flattenObject,
  isConfigRecord,
  getValueAtPath,
  holdErrorToasts,
  hasPathOrAncestor,
  secretPathForPreviewPath,
} from '~/admin/utils';
import {
  findEntry,
  lowerValue,
  applySaves,
  isSecretPath,
  isObjectList,
  summarizeChanges,
} from '~/admin/components/configuration/review/diff';
import {
  locate,
  scopeTypeLabel,
  buildReviewModel,
} from '~/admin/components/configuration/review/group';
import { revealConfigPath } from '~/admin/components/configuration/review/reveal';
import { toReviewIssues } from '~/admin/components/configuration/review/issues';
import { overrideCountUnit } from '~/admin/components/configuration/counts';
import { planRevert } from '~/admin/components/configuration/review/revert';
import { findSchemaField } from '~/admin/components/configuration/controls';
import { normalizeForSave } from '~/admin/components/configuration/edits';
import { useLocalize } from '../useLocalize';

const NO_ISSUES: t.ReviewIssue[] = [];

/** Where Go to field lands: a removed entry is no longer on the page, so its list. */
function goToPath(item: t.ChangeSummaryItem): string {
  if (item.kind === 'removed' && item.entryPath === item.path && item.collectionPath) {
    return item.collectionPath;
  }
  return item.path;
}

function namesOf(list: t.ConfigValue): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(list)) return names;
  for (const entry of list) {
    if (isConfigRecord(entry) && typeof entry.name === 'string') names.add(entry.name);
  }
  return names;
}

/**
 * The change review (WS7): what Save writes, as human-readable rows grouped
 * tab › section › entry, with BEFORE values from the target being saved
 * (the open profile's own values, or Base), pre-flight problems that block
 * Save, per-row Revert and Go to field, and Discard with Undo.
 */
export function useChangeReview({
  schemaTree,
  editingScope,
  layers,
  edits,
  save,
  onTabChange,
}: t.ChangeReviewOptions): t.ChangeReviewState {
  const localize = useLocalize();
  const isScope = editingScope !== undefined;
  const { savePlan, fieldErrors, changes, confirmSaveOpen: open } = save;
  const {
    configValues,
    dbOverrides,
    yamlConfig,
    yamlMcpServers,
    schemaDefaults,
    schemaPathSet,
    overridePaths,
    valueLayers,
    baseActiveConfigValues: baseline,
  } = layers;
  /** The target's own values: the base admin overrides, or the open profile's (WS4). */
  const ownValues = isScope ? valueLayers?.scope?.overrides : dbOverrides;

  const yamlEntryKeys = useMemo(() => {
    const endpoints = isConfigRecord(yamlConfig?.endpoints) ? yamlConfig.endpoints : undefined;
    return new Map<string, Set<string>>([
      ['endpoints.custom', namesOf(endpoints?.custom)],
      ['mcpServers', new Set(Object.keys(yamlMcpServers ?? {}))],
    ]);
  }, [yamlConfig, yamlMcpServers]);

  /** What a path reverts to or inherits: WS4's layers, else librechat.yaml or Base directly. */
  const lowerAt = useCallback(
    (path: string) =>
      valueLayers
        ? revertTargetAt(path, valueLayers)
        : lowerValue(path, { isScope, configValues, yamlConfig, schemaDefaults }),
    [valueLayers, isScope, configValues, yamlConfig, schemaDefaults],
  );

  const input = useMemo<t.ChangeSummaryInput>(
    () => ({
      saves: savePlan.saves,
      resets: savePlan.resets,
      baseline,
      ownAt: (path) => getValueAtPath(ownValues, path),
      isOwned: (path) => hasPathOrAncestor(overridePaths, path),
      lowerAt,
      yamlEntries: (collectionPath) => (isScope ? undefined : yamlEntryKeys.get(collectionPath)),
      isScope,
      fields: schemaTree,
      schemaPaths: schemaPathSet,
    }),
    [
      savePlan,
      baseline,
      isScope,
      ownValues,
      overridePaths,
      lowerAt,
      yamlEntryKeys,
      schemaTree,
      schemaPathSet,
    ],
  );

  /** Pending hides and unhides of inherited values: Save writes them as tombstone ops (WS1). */
  const visibilityItems = useMemo(
    () =>
      Object.entries(edits.visibilityEdits).map(
        ([path, edit]): t.ChangeSummaryItem => ({
          path,
          kind: edit === 'hide' ? 'hidden' : 'unhidden',
          before: undefined,
          after: undefined,
          revertTarget: lowerAt(path),
          sourcePath: path,
          secret: isSecretPath(path) || undefined,
        }),
      ),
    [edits.visibilityEdits, lowerAt],
  );

  /**
   * Rows from the pending edits, flagged where the saved value changed since
   * the edit (WS1, SV-8), and where Global (`endpoints.all`) takes precedence
   * over the value being set, so the change has no effect (D11).
   */
  const items = useMemo(() => {
    const drift = new Map(
      changes.filter((change) => change.drift).map((change) => [change.path, change.drift]),
    );
    const rows = [...summarizeChanges(input), ...visibilityItems];
    return rows.map((item) => {
      const found = drift.get(item.path);
      const shadowedBy =
        item.after !== undefined
          ? resolveShadowedBy(item.path, baseline, edits.editedValues)
          : undefined;
      if (!found && !shadowedBy) return item;
      const shadowed: t.ChangeWarning =
        shadowedBy?.precedence === 'block' ? 'shadowedBlock' : 'shadowed';
      return {
        ...item,
        ...(found && { drift: found }),
        ...(shadowedBy && { warnings: [...(item.warnings ?? []), shadowed] }),
      };
    });
  }, [input, changes, visibilityItems, baseline, edits.editedValues]);

  const labelContext = useMemo<t.ReviewLabelContext>(
    () => ({ localize, fields: schemaTree, tree: applySaves(baseline, savePlan.saves) }),
    [localize, schemaTree, baseline, savePlan],
  );

  /**
   * Blocking problems from the save pipeline (WS1): every client and server
   * issue, at the path the page shows it (entry fields by their position in
   * the pending list), labelled "Tab › Section › Entry › Field".
   */
  const issues = useMemo(
    () =>
      Object.entries(fieldErrors).flatMap(([path, message]) =>
        toReviewIssues(message, true, labelContext, path),
      ),
    [fieldErrors, labelContext],
  );

  /** A failed save that left no issue of its own (e.g. a network error), shown as is. */
  const saveIssues = useMemo(
    () =>
      edits.saveError && issues.length === 0
        ? toReviewIssues(edits.saveError, false, labelContext)
        : NO_ISSUES,
    [edits.saveError, issues.length, labelContext],
  );

  const model = useMemo(
    () => buildReviewModel(items, labelContext, [...issues, ...saveIssues], savePlan.skipped),
    [items, labelContext, issues, saveIssues, savePlan.skipped],
  );

  useEffect(() => (open ? holdErrorToasts() : undefined), [open]);

  const title = useMemo(() => {
    const { count } = model;
    if (count === 0) return localize('com_admin_config_review_title_empty');
    if (!editingScope) return localize('com_admin_config_review_title_base', { count });
    return localize('com_admin_config_review_title_scope', {
      count,
      type: scopeTypeLabel(editingScope, localize),
      name: editingScope.name,
    });
  }, [model, editingScope, localize]);

  const latest = useRef({ edits, baseline });
  latest.current = { edits, baseline };

  const revertRow = useCallback((row: t.ReviewRow) => {
    const { edits: current, baseline: tree } = latest.current;
    if (row.item.kind === 'hidden') {
      current.handleUnhideField(row.item.path);
      return;
    }
    if (row.item.kind === 'unhidden') {
      current.handleHideField(row.item.path);
      return;
    }
    const action = planRevert(row.item, current.editedValues, tree);
    if (action.op === 'set') {
      current.handleFieldChange(action.path, action.value);
      return;
    }
    for (const path of action.paths) current.handleDiscardField(path);
  }, []);

  const { cancelReview } = save;
  const goToRow = useCallback(
    (target: Pick<t.ReviewRow, 'item'> | t.ReviewIssue) => {
      const path = 'item' in target ? goToPath(target.item) : target.path;
      if (!path) return;
      cancelReview();
      onTabChange(locate(path, localize).tabId);
      const item = 'item' in target ? target.item : undefined;
      revealConfigPath(
        path,
        item?.entryPath ? { entryPath: item.entryPath, identity: item.entryIdentity } : undefined,
      );
    },
    [cancelReview, onTabChange, localize],
  );

  const discardAll = useCallback(() => {
    const { edits: current } = latest.current;
    const snapshot = Object.entries(current.editedValues);
    const visibility = Object.entries(current.visibilityEdits);
    const count = Math.max(model.count, 1);
    current.handleDiscard();
    if (snapshot.length === 0 && visibility.length === 0) return;
    notifyUndo(
      localize('com_admin_config_review_discarded', { count }),
      localize('com_admin_config_review_undo'),
      () => {
        const { edits: restore } = latest.current;
        for (const [path, value] of snapshot) {
          if (value === undefined) restore.handleResetField(path);
          else restore.handleFieldChange(path, value);
        }
        for (const [path, edit] of visibility) {
          if (edit === 'hide') restore.handleHideField(path);
          else restore.handleUnhideField(path);
        }
      },
    );
  }, [model.count, localize]);

  const blocked = issues.some((issue) => issue.blocking);

  return {
    model,
    open,
    saving: save.saving,
    sessionExpired: save.sessionExpired,
    saveIssues,
    title,
    scope: editingScope,
    blocked,
    isDirty: edits.isDirty,
    openReview: save.openReview,
    closeReview: save.cancelReview,
    confirm: save.handleConfirmSave,
    revertRow,
    goToRow,
    discardAll,
  };
}

/**
 * What an override list reads as once reverted. A list LibreChat merges by
 * key (`endpoints.custom`) stores only the entries and fields the admin
 * changed (WS1), so each stored entry goes back to its librechat.yaml entry's
 * values for the same fields, and entries librechat.yaml lacks are removed.
 * Other lists go back to the librechat.yaml list whole.
 */
function revertedList(
  path: string,
  stored: t.ConfigRecord[],
  lower: t.ConfigValue[],
): t.ConfigValue[] {
  const collection = getKeyedCollection(path);
  if (collection?.merge !== 'byKey') return lower;
  return stored.flatMap((entry) => {
    const key = getEntryKey(entry, collection.key);
    const yaml = lower.find((item) => getEntryKey(item, collection.key) === key);
    if (!isConfigRecord(yaml)) return [];
    return [sameKeys(yaml, withStoredSecretKey(entry, collection))];
  });
}

/** A stored entry's encrypted secret reads back only as its preview: count it as the key it overrides. */
function withStoredSecretKey(entry: t.ConfigRecord, collection: t.KeyedCollection): t.ConfigRecord {
  const secret = collection.secret;
  if (!secret || secret.key in entry || typeof entry[secret.preview] !== 'string') return entry;
  return { ...entry, [secret.key]: entry[secret.preview] };
}

/** `lower` cut down to the keys `stored` sets (objects key by key), so a revert lists only what the override changed. */
function sameKeys(lower: t.ConfigValue, stored: t.ConfigValue): t.ConfigValue {
  if (!isConfigRecord(lower) || !isConfigRecord(stored)) return lower;
  return Object.fromEntries(
    Object.keys(stored).map((key) => [key, sameKeys(lower[key], stored[key])]),
  );
}

/**
 * A field of a stored entry read as the override it removes: what it goes
 * back to is the librechat.yaml entry's value there (merged records whole), so
 * it reads like the top-level reverts instead of as a change or a removal.
 */
function asEntryRevert(item: t.ChangeSummaryItem, lower: t.ConfigValue[]): t.ChangeSummaryItem {
  /** `added`: a stored secret, which the redacted read leaves out of the override. */
  if (item.kind !== 'changed' && item.kind !== 'removed' && item.kind !== 'added') return item;
  if (!item.entryPath || item.path === item.entryPath || !item.collectionPath) return item;
  const collection = getKeyedCollection(item.collectionPath);
  const yaml = collection
    ? lower.find((entry) => getEntryKey(entry, collection.key) === item.entryIdentity)
    : undefined;
  const value = getValueAtPath(yaml, item.path.slice(item.entryPath.length + 1));
  return {
    ...item,
    kind: 'reverted',
    after: undefined,
    revertTarget: value === undefined ? undefined : { value, source: 'yaml' },
  };
}

/** The entry of a record collection (an MCP server) `path` is in, when librechat.yaml lacks it: reverting removes it whole. */
function panelOnlyRecordEntry(
  fields: t.SchemaField[],
  path: string,
  yamlConfig: t.ConfigRecord | undefined,
): t.ChangeEntryRef | undefined {
  const entry = findEntry(fields, path, () => undefined);
  if (!entry || entry.identity !== entry.entryPath.slice(entry.collectionPath.length + 1)) {
    return undefined;
  }
  if (findSchemaField(fields, entry.collectionPath)?.type !== 'record') return undefined;
  return getValueAtPath(yamlConfig ?? null, entry.entryPath) === undefined ? entry : undefined;
}

/**
 * The base admin overrides "Revert all to librechat.yaml" removes (WS7), as
 * review rows that say what each setting goes back to. Empty objects left
 * behind by earlier resets are not overrides and are not counted.
 */
export function useBaseOverrides({
  schemaTree,
  layers,
}: Pick<t.ChangeReviewOptions, 'schemaTree' | 'layers'>): t.BaseOverridesState {
  const localize = useLocalize();
  const { dbOverrides, yamlConfig, configValues, schemaDefaults, schemaPathSet, valueLayers } =
    layers;
  /** Base mode's layers name the layer a value reverts to (librechat.yaml even when it repeats a default). */
  const baseLayers = valueLayers?.scope ? null : valueLayers;
  return useMemo(() => {
    const overrides = dbOverrides ?? {};
    const paths = new Set<string>();
    const addedEntries = new Map<string, t.ChangeEntryRef>();
    for (const [path, value] of Object.entries(flattenObject(overrides))) {
      if (isConfigRecord(value) && Object.keys(value).length === 0) continue;
      const entry = panelOnlyRecordEntry(schemaTree, path, yamlConfig);
      if (entry) addedEntries.set(entry.entryPath, entry);
      paths.add(entry?.entryPath ?? secretPathForPreviewPath(path, schemaPathSet) ?? path);
    }
    const lower: t.LowerLayers = { isScope: false, configValues, yamlConfig, schemaDefaults };
    const items = [...paths].flatMap((path): t.ChangeSummaryItem[] => {
      const before = getValueAtPath(overrides, path);
      const added = addedEntries.get(path);
      if (added) {
        return [
          {
            path,
            kind: 'removed',
            before,
            after: undefined,
            collectionPath: added.collectionPath,
            entryPath: added.entryPath,
            entryIdentity: added.identity,
          },
        ];
      }
      const target = baseLayers ? revertTargetAt(path, baseLayers) : lowerValue(path, lower);
      const reverted: t.ChangeSummaryItem = {
        path,
        kind: 'reverted',
        before,
        after: undefined,
        revertTarget: target,
        secret: isSecretPath(path) || undefined,
      };
      const lowerList = target?.value;
      if (!isObjectList(before) || !Array.isArray(lowerList)) return [reverted];
      const reverts = revertedList(path, before, lowerList);
      const entries = summarizeChanges({
        saves: [
          {
            fieldPath: path,
            value: normalizeForSave(reverts, findSchemaField(schemaTree, path)),
          },
        ],
        resets: [],
        baseline: overrides,
        ownAt: () => undefined,
        isOwned: () => true,
        lowerAt: () => undefined,
        yamlEntries: () => undefined,
        isScope: false,
        fields: schemaTree,
        schemaPaths: schemaPathSet,
      });
      if (entries.length === 0) return [reverted];
      return entries.map((item) => asEntryRevert(item, lowerList));
    });
    const model = buildReviewModel(items, { localize, fields: schemaTree, tree: overrides });
    /**
     * Counted the way the tab badges count, so they add up to it: a keyed list
     * is one stored value but counts per overridden entry, an MCP server once
     * however many of its fields are set.
     */
    const units = new Set<string>();
    let entryCount = 0;
    for (const path of paths) {
      const collection = getKeyedCollection(path);
      if (!collection) {
        units.add(overrideCountUnit(path));
        continue;
      }
      entryCount += overriddenEntryKeys(
        collection,
        getValueAtPath(overrides, path),
        getValueAtPath(yamlConfig ?? null, path),
      ).size;
    }
    return { count: units.size + entryCount, model };
  }, [
    dbOverrides,
    yamlConfig,
    configValues,
    schemaDefaults,
    schemaPathSet,
    schemaTree,
    baseLayers,
    localize,
  ]);
}
