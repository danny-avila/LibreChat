import { useState, useMemo, useEffect, useCallback } from 'react';
import type * as t from '~/admin/types';
import {
  notifyInfo,
  notifyError,
  notifyWarning,
  notifySuccess,
  getValueAtPath,
  planConfigChanges,
  mergedBackChanges,
} from '~/admin/utils';
import { validateMcpCrossField } from '~/admin/components/configuration/sections/mcp/validation';
import { buildConfigChanges, normalizeEditValue } from '~/admin/components/configuration/edits';
import { isResetSent, summarizeChanges } from '~/admin/components/configuration/summary';
import { describeSkippedChanges } from '~/admin/components/configuration/review/group';
import { describeIssues } from '~/admin/components/configuration/issues';
import { hasPathOverlap } from '~/admin/components/configuration/counts';
import { applyConfigChangesFn, resetBaseConfigFn } from '~/admin/api';
import { useQueryClient } from '~/admin/query';
import { useLocalize } from '../useLocalize';

function toTargetRef(target: t.WriteTarget): t.WriteTargetRef {
  if (target.type === 'base') return { type: 'base' };
  const { principalType, principalId } = target.scope;
  return { type: 'scope', scope: { principalType, principalId } };
}

function hasWrites(plan: t.WritePlan): boolean {
  return (
    plan.sets.length + plan.resets.length + plan.tombstones.length + plan.untombstones.length > 0
  );
}

/** The admin session ended (signed out elsewhere or expired): the save never reached LibreChat. */
const SESSION_ERROR_RE = /no admin session token|session (has )?expired|unauthori[sz]ed|\b401\b/i;

function isSessionError(message: string): boolean {
  return SESSION_ERROR_RE.test(message);
}

/** Skipped changes without repeats (the client and the server can report the same path). */
function uniqueSkipped(skipped: t.SkippedChange[]): t.SkippedChange[] {
  const seen = new Set<string>();
  return skipped.filter(({ fieldPath, reason }) => {
    const key = `${fieldPath}|${reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The save pipeline of the configuration page (WS1). Pending edits become
 * `ConfigChange` ops (keyed collection entries by identity), which are
 * planned against the target's layers on the client for the review, the
 * inline errors and the skipped list, and applied on the server in one
 * validated, all-or-nothing call that reports what did not take effect.
 */
export function useConfigSave({
  schemaTree,
  schemaPathSet,
  editingScope,
  layers,
  edits,
}: t.ConfigSaveOptions): t.ConfigSaveState {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const {
    configValues,
    dbOverrides,
    yamlConfig,
    yamlMcpServers,
    schemaDefaults,
    overridePaths,
    valueLayers,
    baseActiveConfigValues,
  } = layers;
  const {
    editedValues,
    touchedPaths,
    resetEdits,
    setSaveError,
    collectionEdits,
    editBaselines,
    visibilityEdits,
  } = edits;
  const isEditingScope = editingScope !== undefined;

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<t.ConfigIssue[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => setServerIssues([]), [editedValues, visibilityEdits]);

  const clearEdits = useCallback(() => {
    resetEdits();
    setConfirmSaveOpen(false);
    setSaving(false);
    setSaveError(null);
  }, [resetEdits, setSaveError]);

  const describeSkipped = useCallback(
    (skipped: t.SkippedChange[]) =>
      describeSkippedChanges(skipped, {
        localize,
        fields: schemaTree,
        tree: baseActiveConfigValues,
      }),
    [localize, schemaTree, baseActiveConfigValues],
  );

  /**
   * Toast for a finished write: "Changes saved" only when everything took
   * effect; otherwise a warning that lists each change with the reason.
   */
  const announceWrite = useCallback(
    (skipped: t.SkippedChange[], written: number, successMessage: string) => {
      const unique = uniqueSkipped(skipped);
      if (unique.length === 0) {
        notifySuccess(successMessage);
        return;
      }
      const titleKey =
        written > 0 ? 'com_admin_config_apply_not_effective' : 'com_admin_config_nothing_stored';
      notifyWarning(localize(titleKey, { count: unique.length }), describeSkipped(unique));
    },
    [localize, describeSkipped],
  );

  const invalidateTarget = useCallback(
    (target: t.WriteTarget) => {
      if (target.type === 'base') {
        return queryClient.invalidateQueries({ queryKey: ['baseConfig'] });
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resolvedConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['availableScopes'] }),
      ]);
    },
    [queryClient],
  );

  /**
   * Applies ops through the server's validated apply; queries are refetched
   * whatever the outcome. A call that fails outright (an ended session) is
   * reported at once: the refetch, which retries, runs in the background.
   */
  const applyChanges = useCallback(
    async (target: t.WriteTarget, ops: t.ConfigChange[]) => {
      try {
        const result = await applyConfigChangesFn({ data: { target: toTargetRef(target), ops } });
        await invalidateTarget(target);
        return result;
      } catch (err) {
        void invalidateTarget(target);
        throw err;
      }
    },
    [invalidateTarget],
  );

  const describeFailure = useCallback(
    (result: t.ApplyConfigChangesResult, collections: t.PendingCollection[]) => {
      const blocking = [...result.issues, ...result.failed];
      const { summaries } = describeIssues(blocking, collections, localize);
      const titleKey = (() => {
        if (result.issues.length > 0) return 'com_admin_config_validation_failed';
        return result.compensated === false
          ? 'com_admin_config_apply_rollback_incomplete'
          : 'com_admin_config_apply_failed';
      })();
      return `${localize(titleKey)} — ${summaries.join('; ')}`;
    },
    [localize],
  );

  /** The write path shared with imports: saves and resets as ops, all or nothing. */
  const writeChanges = useCallback<t.WriteChangesFn>(
    async (target, saves, resets) => {
      const ops: t.ConfigChange[] = [
        ...saves.map(
          ({ fieldPath, value }): t.ConfigChange => ({
            op: 'set',
            path: fieldPath,
            value,
          }),
        ),
        ...resets.map((path): t.ConfigChange => ({ op: 'reset', path })),
      ];
      const result = await applyChanges(target, ops);
      if (result.issues.length > 0 || result.failed.length > 0) {
        throw new Error(describeFailure(result, []));
      }
      return result.skipped;
    },
    [applyChanges, describeFailure],
  );

  const changeContext = useMemo<t.ChangeContext>(
    () => ({
      fields: schemaTree,
      baselineAt: (path) => getValueAtPath(baseActiveConfigValues, path),
      hasOverride: (path) => hasPathOverlap(path, overridePaths),
      isScope: isEditingScope,
      root: baseActiveConfigValues,
      collections: collectionEdits,
      visibility: visibilityEdits,
    }),
    [
      schemaTree,
      baseActiveConfigValues,
      overridePaths,
      isEditingScope,
      collectionEdits,
      visibilityEdits,
    ],
  );

  const changeSet = useMemo(
    () => buildConfigChanges(touchedPaths, editedValues, schemaPathSet, changeContext),
    [touchedPaths, editedValues, schemaPathSet, changeContext],
  );

  /** The target's stored overrides and the layer beneath, as loaded (the server re-reads them). */
  const snapshot = useMemo<t.WriteSnapshot>(() => {
    if (isEditingScope) {
      return {
        stored: valueLayers?.scope?.overrides ?? {},
        lower: configValues ?? {},
        lowerKind: 'inherited',
      };
    }
    return { stored: dbOverrides ?? {}, lower: yamlConfig ?? {}, lowerKind: 'yaml' };
  }, [isEditingScope, valueLayers, configValues, dbOverrides, yamlConfig]);

  const plan = useMemo(() => planConfigChanges(changeSet.ops, snapshot), [changeSet, snapshot]);

  const clientIssues = useMemo(
    () => [...changeSet.issues, ...plan.issues],
    [changeSet.issues, plan.issues],
  );

  const issues = useMemo(() => [...clientIssues, ...serverIssues], [clientIssues, serverIssues]);

  const { fieldErrors, summaries: issueSummaries } = useMemo(
    () => describeIssues(issues, changeSet.collections, localize),
    [issues, changeSet.collections, localize],
  );

  /**
   * What Save changes, as the admin edited it (the review reads it): plain
   * saves the plan sends, each edited keyed collection as its whole pending
   * list (sent as per-entry ops), the resets the plan sends, and what is left
   * out and why.
   */
  const savePlan = useMemo<t.SavePayload>(() => {
    const notSent = new Set(plan.skipped.map((s) => s.fieldPath));
    const collectionSaves = changeSet.collections.map(({ collection, items }) => ({
      fieldPath: collection.path,
      value: items.map((item) =>
        normalizeEditValue(`${collection.path}.0`, item, schemaTree, schemaPathSet),
      ),
    }));
    return {
      touched: changeSet.payload.touched,
      saves: [
        ...changeSet.payload.saves.filter((s) => !notSent.has(s.fieldPath)),
        ...collectionSaves,
      ],
      resets: changeSet.ops
        .filter((op) => op.op === 'reset' && isResetSent(plan, op.path))
        .map((op) => op.path),
      skipped: uniqueSkipped([
        ...changeSet.payload.skipped,
        ...plan.skipped,
        ...mergedBackChanges(plan.warnings, snapshot),
      ]),
    };
  }, [changeSet, plan, snapshot, schemaTree, schemaPathSet]);

  const unsafeKeys = useMemo(
    () =>
      plan.issues
        .filter((issue) => issue.code === 'UNSAFE_KEY')
        .map((issue) => ({ path: issue.path, key: String(issue.params?.key ?? '') })),
    [plan.issues],
  );

  const summaryLayers = useMemo<t.SummaryLayers>(() => {
    const ownValues = isEditingScope ? snapshot.stored : (dbOverrides ?? {});
    return {
      baselineAt: (path) => getValueAtPath(baseActiveConfigValues, path),
      ownAt: (path) => getValueAtPath(ownValues, path),
      revertAt: (path) => {
        const lower = getValueAtPath(isEditingScope ? configValues : yamlConfig, path);
        if (lower !== undefined) {
          return { value: lower, source: isEditingScope ? 'inherited' : 'yaml' };
        }
        return { value: schemaDefaults[path], source: 'default' };
      },
      editBaselines,
    };
  }, [
    isEditingScope,
    snapshot.stored,
    dbOverrides,
    baseActiveConfigValues,
    configValues,
    yamlConfig,
    schemaDefaults,
    editBaselines,
  ]);

  const changes = useMemo(
    () => summarizeChanges(changeSet, plan, summaryLayers),
    [changeSet, plan, summaryLayers],
  );

  const editTarget = useMemo<t.WriteTarget>(
    () =>
      isEditingScope && editingScope ? { type: 'scope', scope: editingScope } : { type: 'base' },
    [isEditingScope, editingScope],
  );

  /** Per-leaf saves can land an MCP entry in a transport state whose required siblings are missing; check the merged entry (scope-resolved in a profile) before anything is sent. */
  const findMcpError = useCallback((): string | null => {
    const { touched, saves, resets } = changeSet.payload;
    const savedValues = new Map(saves.map((e) => [e.fieldPath, e.value]));
    const resetSet = new Set(resets);
    const mcpEdits: Array<[string, t.ConfigValue]> = touched
      .filter((p) => p.startsWith('mcpServers.') && (savedValues.has(p) || resetSet.has(p)))
      .map((p) => [p, savedValues.get(p)]);
    if (mcpEdits.length === 0) return null;
    const asRecord = (value: t.ConfigValue) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, t.ConfigValue>)
        : undefined;
    /** A reset reveals the next-lower layer: the base config in a profile, librechat.yaml in base. */
    const fallback = asRecord(isEditingScope ? configValues?.mcpServers : yamlMcpServers);
    const mcpErrors = validateMcpCrossField(
      asRecord(baseActiveConfigValues?.mcpServers) ?? {},
      mcpEdits,
      fallback,
    );
    if (mcpErrors.length === 0) return null;
    const { entryKey, missingField } = mcpErrors[0];
    return localize('com_admin_config_mcp_invalid_after_edit', {
      entry: entryKey,
      field: missingField,
    });
  }, [
    changeSet.payload,
    isEditingScope,
    configValues,
    yamlMcpServers,
    baseActiveConfigValues,
    localize,
  ]);

  const handleConfirmSave = useCallback(async () => {
    if (saving || unsafeKeys.length > 0) return;
    if (clientIssues.length > 0) {
      setSaveError(
        `${localize('com_admin_config_validation_failed')} — ${issueSummaries.join('; ')}`,
      );
      return;
    }
    if (!hasWrites(plan)) {
      clearEdits();
      if (savePlan.skipped.length > 0)
        announceWrite(savePlan.skipped, 0, localize('com_admin_config_saved'));
      else notifyInfo(localize('com_admin_config_nothing_to_save'));
      return;
    }
    const mcpError = findMcpError();
    if (mcpError) {
      setSaveError(mcpError);
      notifyError(mcpError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSessionExpired(false);
    try {
      const result = await applyChanges(editTarget, changeSet.ops);
      if (result.issues.length > 0 || result.failed.length > 0) {
        const message = describeFailure(result, changeSet.collections);
        setServerIssues([...result.issues, ...result.failed]);
        setSaving(false);
        setSaveError(message);
        notifyError(message);
        return;
      }
      clearEdits();
      announceWrite(
        [...changeSet.payload.skipped, ...result.skipped],
        result.applied,
        localize('com_admin_config_saved'),
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const expired = isSessionError(raw);
      const message = expired ? localize('com_admin_config_session_expired') : raw;
      setSaving(false);
      setSessionExpired(expired);
      setSaveError(message);
      notifyError(message);
    }
  }, [
    saving,
    unsafeKeys,
    clientIssues,
    issueSummaries,
    plan,
    savePlan,
    changeSet,
    clearEdits,
    announceWrite,
    findMcpError,
    applyChanges,
    describeFailure,
    editTarget,
    localize,
    setSaveError,
  ]);

  /**
   * Opening the review re-reads the target, so rows saved by someone else
   * meanwhile are flagged as drifted (SV-8). Blocking problems are listed by
   * the review from `issues`.
   */
  const openReview = useCallback(() => {
    void invalidateTarget(editTarget);
    setSaveError(null);
    setSessionExpired(false);
    setConfirmSaveOpen(true);
  }, [invalidateTarget, editTarget, setSaveError]);

  const cancelReview = useCallback(() => {
    setConfirmSaveOpen(false);
    setSaveError(null);
    setSessionExpired(false);
  }, [setSaveError]);

  const closeReview = useCallback(() => setConfirmSaveOpen(false), []);

  return {
    confirmSaveOpen,
    saving,
    sessionExpired,
    savePlan,
    unsafeKeys,
    changes,
    warnings: plan.warnings,
    issues,
    fieldErrors,
    issueSummaries,
    handleConfirmSave,
    openReview,
    cancelReview,
    closeReview,
    writeChanges,
    announceWrite,
    describeSkipped,
  };
}

/** The "Reset base config" action: deletes every base admin override (WS1). */
export function useResetBaseConfig({ onReset }: t.ResetBaseConfigOptions): t.ResetBaseConfigState {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [resetBaseOpen, setResetBaseOpen] = useState(false);
  const [resettingBase, setResettingBase] = useState(false);
  const [resetBaseError, setResetBaseError] = useState<string | null>(null);

  const handleResetBaseConfig = useCallback(async () => {
    if (resettingBase) return;
    setResettingBase(true);
    setResetBaseError(null);
    try {
      await resetBaseConfigFn();
      /** resolvedConfig holds each scope's own overrides (not a base merge), so a
       *  base reset doesn't make it stale on its own — but base-derived data
       *  (schemaDefaults, base values used for MCP inheritance) feeds scope mode,
       *  so flush it too, consistent with how scope saves invalidate. */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['baseConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['resolvedConfig'] }),
      ]);
      onReset();
      setResettingBase(false);
      setResetBaseOpen(false);
      notifySuccess(localize('com_admin_config_reset_base_success'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResettingBase(false);
      setResetBaseError(message);
      notifyError(message);
    }
  }, [resettingBase, queryClient, localize, onReset]);

  const openResetBase = useCallback(() => {
    setResetBaseError(null);
    setResetBaseOpen(true);
  }, []);

  const cancelResetBase = useCallback(() => {
    if (resettingBase) return;
    setResetBaseOpen(false);
    setResetBaseError(null);
  }, [resettingBase]);

  return {
    resetBaseOpen,
    resettingBase,
    resetBaseError,
    openResetBase,
    cancelResetBase,
    handleResetBaseConfig,
  };
}
