import { useState, useMemo, useCallback } from 'react';
import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  notifySuccess,
  notifyWarning,
  flattenObject,
  isConfigRecord,
  getValueAtPath,
  revertTargetAt,
  createBaseLayers,
  mergeConfigLayers,
  hasPathOrAncestor,
  planConfigChanges,
  setValueAtPath,
  getKeyedCollection,
  stripSecretPreviewValues,
} from '~/admin/utils';
import {
  locate,
  fieldLabel,
  describePath,
  scopeTypeLabel,
  buildReviewModel,
  principalTypeLabel,
} from '~/admin/components/configuration/review/group';
import {
  lowerValue,
  applySaves,
  identityKeyFor,
  summarizeChanges,
} from '~/admin/components/configuration/review/diff';
import { isConfigValueEqual, normalizeForSave } from '~/admin/components/configuration/edits';
import { createRoleFn, createScopeFn, createGroupFn, baseConfigOptions } from '~/admin/api';
import { planImport, IMPORT_SKIP_KEYS } from '~/admin/components/configuration/import';
import { findSchemaField } from '~/admin/components/configuration/controls';
import { describeIssues } from '~/admin/components/configuration/issues';
import { resolvedConfigOptions, runtimeDefaultAt } from './layers';
import { useQuery, useQueryClient } from '~/admin/query';
import { useLocalize } from '../useLocalize';

/** Lists LibreChat merges with librechat.yaml by name; an import upserts their entries by name. */
const MERGED_COLLECTIONS: ReadonlySet<string> = new Set(['endpoints.custom']);

/** An endpoint's parameter definitions: LibreChat expands librechat.yaml's at startup, never an override's. */
const PARAM_DEFINITIONS = 'customParams.paramDefinitions';

/** "Base configuration", "Role: ADMIN", or "New group: QA" for an import target. */
export function importTargetLabel(target: t.ImportTarget, localize: t.LocalizeFn): string {
  if (target.type === 'base') return localize('com_admin_config_review_import_target_base');
  if (target.type === 'scope') {
    return `${scopeTypeLabel(target.scope, localize)}: ${target.scope.name}`;
  }
  return localize('com_admin_config_review_import_target_new', {
    type: principalTypeLabel(target.principalType, localize),
    name: target.name,
  });
}

function namesOf(list: t.ConfigValue[], key: string): Set<t.ConfigValue> {
  return new Set(list.filter(isConfigRecord).map((entry) => entry[key]));
}

/**
 * Imported entries as they will read once written: LibreChat merges each one
 * into the entry of the same name key by key (D4), so keys the YAML leaves
 * out keep their values and the preview lists only the keys it sets.
 */
function mergedEntries(path: string, existing: t.ConfigValue, incoming: t.ConfigValue) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) return incoming;
  const key = identityKeyFor(path, [...existing, ...incoming]);
  if (!key) return incoming;
  return incoming.map((entry) => {
    const match = isConfigRecord(entry)
      ? existing.find((item) => isConfigRecord(item) && item[key] === entry[key])
      : undefined;
    return match === undefined ? entry : mergeConfigLayers(match, entry);
  });
}

/** The entry of `list` that `entry` names (same identity key value), if any. */
function matchOf(list: t.ConfigValue, entry: t.ConfigValue, key: string): t.ConfigValue {
  if (!Array.isArray(list) || !isConfigRecord(entry)) return undefined;
  return list.find((item) => isConfigRecord(item) && item[key] === entry[key]);
}

/**
 * An imported entry with each parameter definition written over the
 * effective one of the same key, as the entry card writes it: LibreChat
 * expands librechat.yaml's definitions (`parseCustomParams`: type, component,
 * label) but serves an override's as stored, and its client then replaces
 * the whole definition, so a raw `{ key, default }` would lose its control.
 */
function withExpandedDefinitions(entry: t.ConfigValue, effective: t.ConfigValue): t.ConfigValue {
  if (!isConfigRecord(entry) || !isConfigRecord(effective)) return entry;
  const imported = getValueAtPath(entry, PARAM_DEFINITIONS);
  const expanded = getValueAtPath(effective, PARAM_DEFINITIONS);
  if (!Array.isArray(imported) || !Array.isArray(expanded)) return entry;
  return setValueAtPath(
    entry,
    PARAM_DEFINITIONS,
    imported.map((definition) => {
      const match = matchOf(expanded, definition, 'key');
      return match === undefined ? definition : mergeConfigLayers(match, definition);
    }),
  );
}

/**
 * Whether the effective entry has a key LibreChat hides entirely (a literal
 * key from librechat.yaml: neither the value nor a stored-key preview is
 * read back), so an imported literal can't be compared with it.
 */
function hidesSecret(match: t.ConfigValue, secret: t.KeyedCollection['secret']): boolean {
  if (!secret || !isConfigRecord(match)) return false;
  return match[secret.key] === undefined && match[secret.preview] === undefined;
}

/**
 * The imported entries of a merged list that change what users get (each
 * merged over the effective entry of its name), definitions expanded; an
 * entry identical to the effective one is dropped, so it is neither shown
 * nor written as a change. A key the effective entry hides is left out
 * (`hiddenSecrets` gets its imported path): importing librechat.yaml back
 * would otherwise store its own key again as an override.
 */
function changedEntries(
  path: string,
  effective: t.ConfigValue,
  incoming: t.ConfigValue,
  hiddenSecrets: string[],
): t.ConfigValue {
  if (!Array.isArray(incoming)) return incoming;
  const key = identityKeyFor(path, [...(Array.isArray(effective) ? effective : []), ...incoming]);
  if (!key) return incoming;
  const secret = getKeyedCollection(path)?.secret;
  return incoming.flatMap((entry, index) => {
    const match = matchOf(effective, entry, key);
    let expanded = withExpandedDefinitions(entry, match);
    if (secret && isConfigRecord(expanded) && expanded[secret.key] !== undefined) {
      if (hidesSecret(match, secret)) {
        hiddenSecrets.push(`${path}.${index}.${secret.key}`);
        const { [secret.key]: _hidden, ...rest } = expanded;
        expanded = rest;
      }
    }
    if (match !== undefined && isConfigValueEqual(mergeConfigLayers(match, expanded), match)) {
      return [];
    }
    return [expanded];
  });
}

/** `incoming` entries written over `own` by name; entries the import does not list are kept. */
function upsertByName(path: string, own: t.ConfigValue, incoming: t.ConfigValue): t.ConfigValue {
  if (!Array.isArray(own) || !Array.isArray(incoming)) return incoming;
  const key = identityKeyFor(path, [...own, ...incoming]);
  if (!key) return incoming;
  const byName = new Map(incoming.filter(isConfigRecord).map((entry) => [entry[key], entry]));
  const ownNames = namesOf(own, key);
  return [
    ...own.map((entry) => (isConfigRecord(entry) && byName.get(entry[key])) || entry),
    ...incoming.filter((entry) => !isConfigRecord(entry) || !ownNames.has(entry[key])),
  ];
}

/** Only the entries the import lists, so the preview never reads the others as removed. */
function onlyImported(
  path: string,
  baseline: t.ConfigValue,
  incoming: t.ConfigValue,
): t.ConfigValue {
  if (!Array.isArray(baseline) || !Array.isArray(incoming)) return baseline;
  const key = identityKeyFor(path, [...baseline, ...incoming]);
  if (!key) return baseline;
  const names = namesOf(incoming, key);
  return baseline.filter((entry) => isConfigRecord(entry) && names.has(entry[key]));
}

/** Review rows of one imported leaf, entry groups flattened into "Entry › Field" labels. */
function rowsOf(model: t.ChangeReviewModel): t.ReviewRow[] {
  return model.tabs.flatMap((tab) =>
    tab.sections.flatMap((section) => [
      ...section.rows,
      ...section.entries.flatMap((group) =>
        group.rows.map((row) => ({ ...row, label: `${group.title} › ${row.label}` })),
      ),
    ]),
  );
}

/**
 * The import wizard's preview (WS7, RV-6): every leaf of the YAML compared
 * with what the chosen target has now (its own value, or what it inherits),
 * grouped by tab and section, plus the leaves that are left out and why.
 */
export function useImportPreview({
  schemaTree,
  schemaPathSet,
  appConfig,
  target,
}: t.ImportPreviewOptions): t.ImportPreviewState {
  const localize = useLocalize();
  const { data: base, isLoading: baseLoading } = useQuery(baseConfigOptions);
  const existingScope = target?.type === 'scope' && target.exists ? target.scope : undefined;
  const { data: scopeData, isLoading: scopeLoading } = useQuery(
    resolvedConfigOptions(
      existingScope ? { type: 'SCOPE', scope: existingScope } : { type: 'BASE' },
    ),
  );

  const isScopeTarget = target != null && target.type !== 'base';
  const plan = useMemo(
    () => (appConfig ? planImport(appConfig, schemaTree, schemaPathSet, isScopeTarget) : undefined),
    [appConfig, schemaTree, schemaPathSet, isScopeTarget],
  );

  /** librechat.yaml and the base overrides as layers, so a value is labelled by the layer that sets it. */
  const baseLayers = useMemo(
    () => (base ? createBaseLayers(base, schemaPathSet, runtimeDefaultAt) : null),
    [base, schemaPathSet],
  );

  const own = useMemo<t.ConfigRecord>(() => {
    if (target?.type === 'base') return base?.dbOverrides ?? {};
    if (!existingScope || !scopeData) return {};
    return scopeData.overrides;
  }, [target, base, existingScope, scopeData]);

  /**
   * The plan's entries as Apply writes them: each merged list narrowed to the
   * entries that change what users get now (a profile's merge over what it
   * inherits; Base's effective list), parameter definitions expanded.
   */
  const { entries, hiddenSecrets } = useMemo(() => {
    const hidden: string[] = [];
    if (!plan || !target || !base) return { entries: plan?.entries ?? [], hiddenSecrets: hidden };
    const isScope = target.type !== 'base';
    const written = plan.entries.flatMap((entry): t.SaveEntry[] => {
      const path = entry.fieldPath;
      if (!MERGED_COLLECTIONS.has(path)) return [entry];
      const effective = isScope
        ? mergeConfigLayers(getValueAtPath(base.config, path), getValueAtPath(own, path), path)
        : getValueAtPath(base.config, path);
      const value = changedEntries(path, effective, entry.value, hidden);
      return Array.isArray(value) && value.length === 0 ? [] : [{ fieldPath: path, value }];
    });
    return { entries: written, hiddenSecrets: hidden };
  }, [plan, target, base, own]);

  const groups = useMemo((): t.ImportPreviewGroup[] => {
    if (!plan || !target || !base) return [];
    const isScope = target.type !== 'base';
    const baseline: t.ConfigRecord = isScope ? own : (base.config ?? {});
    const ownPaths = new Set(Object.keys(flattenObject(own)));
    const layers: t.LowerLayers = {
      isScope,
      configValues: base.config ?? null,
      yamlConfig: base.yamlConfig,
      schemaDefaults: base.schemaDefaults ?? {},
    };
    /**
     * The target has no value of its own and already gets the imported one
     * from the layer below (Base for a profile; librechat.yaml or the default
     * for Base): importing it changes nothing users see.
     */
    const lowerAt = (path: string) =>
      !isScope && baseLayers ? revertTargetAt(path, baseLayers) : lowerValue(path, layers);
    const isInEffect = (path: string, value: t.ConfigValue) => {
      if (getValueAtPath(own, path) !== undefined) return false;
      const lower = lowerAt(path)?.value;
      return isConfigValueEqual(normalizeForSave(lower, findSchemaField(schemaTree, path)), value);
    };
    const sections = new Map<string, t.ImportPreviewGroup>();
    const written = new Map(entries.map((entry) => [entry.fieldPath, entry]));
    for (const imported of plan.entries) {
      /** A merged list whose entries all match what users get already is listed as unchanged. */
      const path = imported.fieldPath;
      const entry = written.get(path) ?? { fieldPath: path, value: [] };
      const isMerged = MERGED_COLLECTIONS.has(path);
      /** What users get now: a profile's entries merge over the ones it inherits. */
      const existing = isScope
        ? mergeConfigLayers(getValueAtPath(base.config, path), getValueAtPath(own, path), path)
        : getValueAtPath(baseline, path);
      /** Secret preview companions are read-only display values: neither side lists them. */
      const withoutPreviews = (value: t.ConfigValue) =>
        stripSecretPreviewValues(value, path, schemaPathSet);
      const scoped = isMerged
        ? applySaves(baseline, [
            {
              fieldPath: path,
              value: withoutPreviews(onlyImported(path, existing, entry.value)),
            },
          ])
        : baseline;
      const save = isMerged
        ? { fieldPath: path, value: withoutPreviews(mergedEntries(path, existing, entry.value)) }
        : entry;
      const items = !written.has(path)
        ? []
        : summarizeChanges({
            saves: [save],
            resets: [],
            baseline: scoped,
            ownAt: (p) => getValueAtPath(own, p),
            isOwned: (p) => hasPathOrAncestor(ownPaths, p),
            lowerAt,
            yamlEntries: () => undefined,
            isScope,
            fields: schemaTree,
            schemaPaths: schemaPathSet,
          });
      const model = buildReviewModel(items, { localize, fields: schemaTree, tree: scoped });
      const location = locate(path, localize);
      const key = `${location.tabId}:${location.sectionKey}`;
      const group = sections.get(key) ?? {
        key,
        title:
          location.sectionTitle === location.tabTitle
            ? location.tabTitle
            : `${location.tabTitle} › ${location.sectionTitle}`,
        rows: [],
      };
      group.rows.push({
        fieldPath: path,
        label:
          path === location.sectionKey
            ? location.sectionTitle
            : fieldLabel(path, location.sectionKey, localize),
        rows: rowsOf(model),
        unchanged: items.length === 0 || (!isMerged && isInEffect(path, entry.value)),
        unknown: plan.unknown.has(path),
        replacesList: items.some((item) => item.warnings?.includes('ownershipChange')),
      });
      sections.set(key, group);
    }
    return [...sections.values()];
  }, [plan, entries, target, base, baseLayers, own, schemaTree, schemaPathSet, localize]);

  const skipped = useMemo((): t.ReviewSkippedRow[] => {
    if (!plan) return [];
    const ctx: t.ReviewLabelContext = { localize, fields: schemaTree, tree: appConfig ?? null };
    const rows = plan.skipped.map((skip, i) => {
      const holder = skip.fieldPath ? describePath(skip.fieldPath, ctx) : '';
      return {
        key: `${i}:${skip.fieldPath}`,
        path: skip.fieldPath,
        label: skip.key ? [holder, `"${skip.key}"`].filter(Boolean).join(' › ') : holder,
        reason: localize(IMPORT_SKIP_KEYS[skip.reason]),
      };
    });
    const hiddenRows = hiddenSecrets.map((path) => ({
      key: `hidden:${path}`,
      path,
      label: describePath(path, ctx),
      reason: localize('com_admin_config_review_import_skip_hidden_secret'),
    }));
    return [...rows, ...hiddenRows];
  }, [plan, hiddenSecrets, appConfig, schemaTree, localize]);

  /** What Apply writes for the chosen leaves: merged collections upsert into the target's own list. */
  const entriesFor = useCallback(
    (included: ReadonlySet<string>): t.SaveEntry[] =>
      entries
        .filter((entry) => included.has(entry.fieldPath))
        .map((entry) => {
          if (!MERGED_COLLECTIONS.has(entry.fieldPath)) return entry;
          const ownList = getValueAtPath(own, entry.fieldPath);
          return {
            fieldPath: entry.fieldPath,
            value: upsertByName(entry.fieldPath, ownList, entry.value),
          };
        }),
    [entries, own],
  );

  /** The target's stored overrides and the layer beneath, as the validated write reads them. */
  const snapshot = useMemo<t.WriteSnapshot | null>(() => {
    if (!target || !base) return null;
    if (target.type === 'base') {
      return { stored: base.dbOverrides ?? {}, lower: base.yamlConfig ?? {}, lowerKind: 'yaml' };
    }
    return { stored: own, lower: base.config ?? {}, lowerKind: 'inherited' };
  }, [target, base, own]);

  /** The same pre-flight the write runs, so the preview refuses what Import would (an endpoint with only a name). */
  const issuesFor = useCallback(
    (included: ReadonlySet<string>): string[] => {
      if (!snapshot) return [];
      const ops = entriesFor(included).map(
        ({ fieldPath, value }): t.ConfigChange => ({ op: 'set', path: fieldPath, value }),
      );
      if (ops.length === 0) return [];
      const { issues } = planConfigChanges(ops, snapshot);
      return describeIssues(issues, [], localize).summaries;
    },
    [snapshot, entriesFor, localize],
  );

  return {
    plan,
    groups,
    skipped,
    entriesFor,
    issuesFor,
    loading: baseLoading || (existingScope != null && scopeLoading),
  };
}

/**
 * The YAML import (WS7, RV-6): writes the chosen leaves into the target's
 * overrides through the same validated write path as Save (D4: merge, no
 * replace). A role, group or user without a profile gets one first, at the
 * default priority of its type (`createScopeFn`, WS8); "Create new" also creates the role or group itself.
 * One notification reports the result.
 */
export function useConfigImport({
  writeChanges,
  describeSkipped,
}: t.ConfigImportOptions): t.ConfigImportState {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const resolveTarget = useCallback(async (target: t.ImportTarget): Promise<t.WriteTarget> => {
    if (target.type === 'base') return { type: 'base' };
    if (target.type === 'scope' && target.exists) return { type: 'scope', scope: target.scope };
    const principal =
      target.type === 'scope'
        ? target.scope
        : await createPrincipal(target.principalType, target.name);
    const { scope } = await createScopeFn({
      data: {
        principalType: principal.principalType,
        name: principal.name,
        principalId: principal.principalId,
      },
    });
    return { type: 'scope', scope };
  }, []);

  const handleImport = useCallback(
    async ({ target, entries }: t.ImportRequest) => {
      if (entries.length === 0) throw new Error(localize('com_admin_config_import_nothing'));
      const writeTarget = await resolveTarget(target);
      if (target.type !== 'base') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['availableScopes'] }),
          queryClient.invalidateQueries({ queryKey: ['roles'] }),
          queryClient.invalidateQueries({ queryKey: ['groups'] }),
        ]);
      }
      const skipped = await writeChanges(writeTarget, entries, []);
      const written = Math.max(0, entries.length - skipped.length);
      const message =
        writeTarget.type === 'scope'
          ? localize('com_admin_config_import_profile_success', {
              count: written,
              name: `${scopeTypeLabel(writeTarget.scope, localize)}: ${writeTarget.scope.name}`,
            })
          : localize('com_admin_config_import_base_success', { count: written });
      if (skipped.length === 0) {
        notifySuccess(message);
        return;
      }
      const title =
        written > 0
          ? message
          : localize('com_admin_config_nothing_stored', { count: skipped.length });
      notifyWarning(title, describeSkipped(skipped));
    },
    [localize, queryClient, resolveTarget, writeChanges, describeSkipped],
  );

  return { importOpen, setImportOpen, handleImport };
}

/** Creates the role or group a "Create new" import targets. */
async function createPrincipal(
  principalType: PrincipalType,
  name: string,
): Promise<Pick<t.ConfigScope, 'principalType' | 'principalId' | 'name'>> {
  if (principalType === PrincipalType.ROLE) {
    const { role } = await createRoleFn({ data: { name } });
    return { principalType, principalId: role.id, name: role.name };
  }
  const { group } = await createGroupFn({ data: { name, description: '' } });
  return { principalType, principalId: group.id, name: group.name };
}
