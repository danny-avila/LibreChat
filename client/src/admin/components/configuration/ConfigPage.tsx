import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type * as t from '~/admin/types';
import {
  useLocalize,
  useTabBadges,
  useConfigSave,
  useTabSections,
  useConfigEdits,
  useConfigTabs,
  useConfigLayers,
  useConfigImport,
  useChangeReview,
  useBaseOverrides,
  useRevealField,
  useConfigBaseline,
  useNavigationGuard,
  useActiveSection,
  useScopeSelection,
  useScopeGatedSections,
  useResetBaseConfig,
  useConfigSearchIndex,
  usePendingConfigValues,
} from '~/admin/hooks';
import {
  notifyError,
  isRowVisible,
  moveEntryPath,
  notifyWarning,
  findEntryIndex,
  getValueAtPath,
  parseScopeParam,
  createPathIndex,
  formatScopeParam,
  findScopeByParam,
  getKeyedCollection,
  isConfigValueEqual,
} from '~/admin/utils';
import { availableScopesOptions, configSchemaTreeOptions } from '~/admin/api';
import { ConfigErrorsProvider } from '~/admin/contexts/ConfigErrorsContext';
import { RevealTargetContext } from '~/admin/contexts/RevealTargetContext';
import { buildTocEntries, findTocEntry, toJumpTargets } from './toc';
import { ScopeActionsProvider } from '~/admin/contexts/ScopeContext';
import { ConfigTableOfContents } from './ConfigTableOfContents';
import { ResetBaseConfigDialog } from './ResetBaseConfigDialog';
import { NavigationGuardDialog } from './NavigationGuardDialog';
import { ExpandProvider } from '~/admin/contexts/ExpandContext';
import { ConfigContentSkeleton } from './ConfigSkeleton';
import { isPathUnder, tabForPath } from './configMeta';
import { SystemCapabilities } from '~/admin/constants';
import { ConfigTabContent } from './ConfigTabContent';
import { ImportYamlDialog } from './ImportYamlDialog';
import { ChangeReview, ChangesBar } from './review';
import { ConfigLoadError } from './ConfigLoadError';
import { ContentToolbar } from './ContentToolbar';
import { ScopeSelector } from './ScopeSelector';
import { ScopeNotFound } from './ScopeNotFound';
import { HeaderActions } from './HeaderActions';
import { ConfigTabBar } from './ConfigTabBar';
import { useNavigate } from '~/admin/router';
import { searchConfigIndex } from './search';
import { revealConfigPath } from './reveal';
import { useQuery } from '~/admin/query';
import { ScopeBar } from './ScopeBar';

const NO_TOC_ENTRIES: t.TocEntry[] = [];

/** Keys AppService adds to the resolved config that are runtime state, not settings. */
const APP_SERVICE_INTERNAL_KEYS = new Set(['paths', 'config', 'availableTools']);

export function ConfigPage({
  initialTab,
  highlightField,
  initialScope,
  customizedOnly = false,
}: t.ConfigPageProps) {
  const localize = useLocalize();
  const navigate = useNavigate({ from: '/configuration/' });
  /* The route renders this page only once the schema tree is loaded (cached for the session). */
  const { data: schemaTree = [] } = useQuery(configSchemaTreeOptions);

  const {
    sectionPermissions,
    visibleTabs,
    activeTab,
    handleTabChange,
    canManageConfig,
    canEditActiveTab,
    permissions,
  } = useConfigTabs({
    schemaTree,
    initialTab:
      initialTab ?? (highlightField?.includes('.') ? tabForPath(highlightField) : undefined),
  });

  const {
    selectedScope,
    selectScope,
    isEditingScope,
    editingScope,
    scopeSelectorOpen,
    setScopeSelectorOpen,
    isResolvingScope = false,
    scopeNotFound,
    scopeLoadError,
    retryScopes,
  } = useScopeSelection({ initialScope });

  const baseline = useConfigBaseline(selectedScope);
  const isReady = baseline.status === 'ready' && !isResolvingScope;
  const layers = useConfigLayers({ schemaTree, selectedScope, sectionPermissions });

  const edits = useConfigEdits({
    isEditingScope,
    flatBaseline: layers.flatBaseline,
    scopeResolvedValues: layers.scopeResolvedValues,
    baseActiveConfigValues: layers.baseActiveConfigValues,
    schemaTree,
    schemaPathSet: layers.schemaPathSet,
  });
  const { editedValues, isDirty, discardEdits, resetEdits } = edits;

  const activeConfigValues = usePendingConfigValues(
    layers.displayConfigValues,
    editedValues,
    layers.valueLayers,
  );

  /** A list entry as the page shows it now and as the open profile inherits it from Base. */
  const scopeEntry = useCallback(
    (collectionPath: string, identity: string) => {
      const collection = getKeyedCollection(collectionPath);
      if (!collection) return null;
      const list = getValueAtPath(activeConfigValues, collectionPath);
      const inheritedList = getValueAtPath(layers.valueLayers?.base ?? null, collectionPath);
      const index = findEntryIndex(list, collection.key, identity);
      const inheritedIndex = findEntryIndex(inheritedList, collection.key, identity);
      return {
        list: Array.isArray(list) ? list : [],
        index,
        inherited: Array.isArray(inheritedList) ? inheritedList[inheritedIndex] : undefined,
      };
    },
    [activeConfigValues, layers.valueLayers],
  );

  const { handleFieldChange } = edits;
  /** Removes the open profile's override of a list entry: back to the inherited entry, or out if it added it. */
  const revertScopeEntry = useCallback(
    (collectionPath: string, identity: string) => {
      const found = scopeEntry(collectionPath, identity);
      if (!found || found.index < 0) return;
      if (found.inherited === undefined) {
        handleFieldChange(
          collectionPath,
          found.list.filter((_, i) => i !== found.index),
        );
        return;
      }
      handleFieldChange(`${collectionPath}.${found.index}`, found.inherited);
    },
    [scopeEntry, handleFieldChange],
  );

  const isScopeEntryPending = useCallback(
    (collectionPath: string, identity: string) => {
      const found = scopeEntry(collectionPath, identity);
      if (!found) return false;
      const current = found.list[found.index];
      if (found.inherited === undefined) return found.index < 0;
      return current !== undefined && isConfigValueEqual(current, found.inherited);
    },
    [scopeEntry],
  );

  const tabBadges = useTabBadges({
    schemaTree,
    visibleTabs,
    activeConfiguredPaths: layers.activeConfiguredPaths,
    activeConfigValues,
    editedValues,
    overridePaths: layers.overridePaths,
    listOverrideCounts: layers.listOverrideCounts,
    isEditingScope,
  });

  const setCustomizedOnly = useCallback(
    (value: boolean) =>
      navigate({
        search: (prev: t.ConfigSearchParams) => ({ ...prev, customized: value ? 1 : undefined }),
        replace: true,
      }),
    [navigate],
  );
  const showAllSettings = useCallback(() => setCustomizedOnly(false), [setCustomizedOnly]);

  const [tabFilter, setTabFilter] = useState({ tab: activeTab, text: '' });
  const filterText = tabFilter.tab === activeTab ? tabFilter.text : '';
  const setFilterText = useCallback(
    (text: string) => setTabFilter({ tab: activeTab, text }),
    [activeTab],
  );
  const clearFilter = useCallback(() => setFilterText(''), [setFilterText]);

  const save = useConfigSave({
    schemaTree,
    schemaPathSet: layers.schemaPathSet,
    editingScope,
    layers,
    edits,
  });
  const { closeReview } = save;

  /** "Go to field" and error jumps from the review may target a setting the tab filter hides. */
  const goToTab = useCallback(
    (tabId: string) => {
      clearFilter();
      handleTabChange(tabId);
    },
    [clearFilter, handleTabChange],
  );
  const review = useChangeReview({
    schemaTree,
    editingScope,
    layers,
    edits,
    save,
    onTabChange: goToTab,
  });

  const resetBase = useResetBaseConfig({ onReset: edits.resetEdits });
  const baseOverrides = useBaseOverrides({ schemaTree, layers });

  const imports = useConfigImport({
    writeChanges: save.writeChanges,
    describeSkipped: save.describeSkipped,
  });

  /** Re-selecting the open scope keeps the edits; any other goes through the guard. */
  const handleScopeChange = useCallback(
    (newSelection: t.ScopeSelection) => {
      const current = editingScope ? formatScopeParam(editingScope) : undefined;
      const next = newSelection.type === 'SCOPE' ? formatScopeParam(newSelection.scope) : undefined;
      if (current === next && !scopeNotFound) return;
      selectScope(newSelection);
    },
    [editingScope, scopeNotFound, selectScope],
  );
  const scopeActions = useMemo<t.ScopeActions>(
    () => ({ selectScope: handleScopeChange, editingScope }),
    [handleScopeChange, editingScope],
  );

  const scopeKey = editingScope ? formatScopeParam(editingScope) : 'base';
  const lastScope = useRef({ key: scopeKey, name: editingScope?.name, param: initialScope });
  useEffect(() => {
    const previous = lastScope.current;
    if (previous.key === scopeKey) return;
    lastScope.current = { key: scopeKey, name: editingScope?.name, param: initialScope };
    /** The open profile was deleted elsewhere (the link still names it): its edits can't be saved. */
    if (isDirty && scopeNotFound != null && previous.param === initialScope) {
      notifyWarning(
        localize('com_admin_config_scope_vanished', {
          name: previous.name ?? scopeNotFound,
          count: Math.max(review.model.count, 1),
        }),
      );
    }
    resetEdits();
    closeReview();
  }, [
    scopeKey,
    editingScope,
    initialScope,
    scopeNotFound,
    isDirty,
    review.model.count,
    localize,
    resetEdits,
    closeReview,
  ]);

  const { data: availableScopes } = useQuery(availableScopesOptions);
  const describeScope = useCallback(
    (scope: string | undefined) => {
      const param = parseScopeParam(scope);
      if (!param) return localize('com_admin_scope_base_config');
      return findScopeByParam(availableScopes ?? [], param)?.name ?? scope ?? '';
    },
    [availableScopes, localize],
  );
  const guard = useNavigationGuard({
    isDirty,
    discardEdits,
    openReview: save.openReview,
    reviewOpen: save.confirmSaveOpen,
    saving: save.saving,
    describeScope,
  });
  const backToBase = useCallback(() => selectScope({ type: 'BASE' }), [selectScope]);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [tocEl, setTocEl] = useState<HTMLElement | null>(null);
  const setActiveSection = useActiveSection(scrollEl, tocEl, activeTab);

  const tabSections = useTabSections({
    schemaTree,
    activeTab,
    activeConfigValues,
    sectionPermissions,
    editedValues,
  });
  const sectionsForActiveTab = useScopeGatedSections(tabSections, isEditingScope);

  const clearFieldParam = useCallback(
    () =>
      navigate({
        search: (prev: t.ConfigSearchParams) => ({ ...prev, tab: activeTab, field: undefined }),
        replace: true,
      }),
    [navigate, activeTab],
  );
  useRevealField({
    container: scrollEl,
    field: highlightField,
    sections: sectionsForActiveTab,
    ready: isReady,
    onDone: clearFieldParam,
  });

  const hasFilter = filterText.trim() !== '';
  /**
   * The tab filter matches the pending values and the saved ones: a row the
   * admin edits while it is matched (an entry renamed) keeps matching, so it
   * never disappears mid-edit, and an entry pending deletion stays findable
   * (with its Undo). New entries match by their pending values.
   */
  const savedValues = isDirty ? layers.displayConfigValues : null;
  const searchIndex = useConfigSearchIndex(
    schemaTree,
    hasFilter ? activeConfigValues : null,
    localize,
    hasFilter,
  );
  const savedIndex = useConfigSearchIndex(
    schemaTree,
    hasFilter ? savedValues : null,
    localize,
    hasFilter && savedValues != null,
  );
  const filterHits = useMemo(() => {
    if (!hasFilter) return undefined;
    const tabSectionIds = new Set(sectionsForActiveTab.map((section) => section.id));
    const onTab = (item: t.ConfigSearchItem) =>
      item.tab === activeTab && tabSectionIds.has(item.sectionId);
    const hits = searchConfigIndex(searchIndex.filter(onTab), filterText, 500);
    if (savedIndex.length === 0) return hits;
    const seen = new Set(hits.map((hit) => hit.item.path));
    /**
     * A saved hit inside a keyed list names a saved position; the page lists
     * pending positions, so it moves with its entry (by identity). An entry
     * pending deletion keeps its list shown (with its pending-deletion card)
     * without matching whichever entry now sits at its old position.
     */
    const saved = searchConfigIndex(savedIndex.filter(onTab), filterText, 500).flatMap((hit) => {
      const path = moveEntryPath(hit.item.path, savedValues, activeConfigValues);
      if (seen.has(path)) return [];
      seen.add(path);
      return [path === hit.item.path ? hit : { ...hit, item: { ...hit.item, path } }];
    });
    return [...hits, ...saved];
  }, [
    hasFilter,
    searchIndex,
    savedIndex,
    savedValues,
    activeConfigValues,
    sectionsForActiveTab,
    activeTab,
    filterText,
  ]);
  const filterSectionIds = useMemo(
    () => filterHits && new Set(filterHits.map((hit) => hit.item.sectionId)),
    [filterHits],
  );
  /** Matching rows, indexed; a section's own hit counts only when none of its rows match. */
  const filterPaths = useMemo(() => {
    if (!filterHits) return undefined;
    const withRows = new Set(
      filterHits.filter((hit) => hit.item.kind !== 'section').map((hit) => hit.item.sectionId),
    );
    return createPathIndex(
      filterHits
        .filter((hit) => hit.item.kind !== 'section' || !withRows.has(hit.item.sectionId))
        .map((hit) => hit.item.path),
    );
  }, [filterHits]);
  /** A jump (search, deep link) to a setting the tab filter hides clears the filter first. */
  useEffect(() => {
    if (highlightField && filterPaths && !isRowVisible(filterPaths, highlightField)) clearFilter();
  }, [highlightField, filterPaths, clearFilter]);

  const configuredPaths = layers.activeConfiguredPaths;
  const revealSetting = useCallback(
    (item: t.ConfigSearchItem) => {
      const hidden =
        customizedOnly &&
        ![...configuredPaths].some((p) => isPathUnder(p, item.path) || isPathUnder(item.path, p));
      navigate({
        search: (prev: t.ConfigSearchParams) => ({
          ...prev,
          field: item.path,
          ...(hidden && { customized: undefined }),
        }),
        replace: true,
      });
    },
    [navigate, customizedOnly, configuredPaths],
  );

  const tocSections = useMemo(
    () =>
      filterSectionIds
        ? sectionsForActiveTab.filter((section) => filterSectionIds.has(section.id))
        : sectionsForActiveTab,
    [sectionsForActiveTab, filterSectionIds],
  );
  const tocEntries = useMemo(
    () => buildTocEntries(tocSections, localize, filterPaths ?? null),
    [tocSections, localize, filterPaths],
  );
  const jumpTargets = useMemo(() => toJumpTargets(tocEntries), [tocEntries]);
  const dirtyPaths = review.model.changedPaths;
  const errorPaths = useMemo(() => Object.keys(save.fieldErrors), [save.fieldErrors]);
  const jumpTo = useCallback(
    (id: string) => {
      const entry = findTocEntry(tocEntries, id);
      if (!entry || !scrollEl) return;
      setActiveSection(id);
      const isSection = entry.id === `section-${entry.sectionId}`;
      revealConfigPath(
        scrollEl,
        { path: entry.path, sectionId: isSection ? undefined : entry.sectionId },
        { align: 'start', focus: false, highlight: false },
      );
    },
    [tocEntries, scrollEl, setActiveSection],
  );

  /** Top-level settings the bundled schema doesn't know (newer LibreChat), listed read-only on System. */
  const topLevelUnknown = useMemo(() => {
    if (activeTab !== 'system' || !activeConfigValues) return undefined;
    const value: Record<string, t.ConfigValue> = {};
    for (const [key, entry] of Object.entries(activeConfigValues)) {
      if (!APP_SERVICE_INTERNAL_KEYS.has(key)) value[key] = entry;
    }
    return { fields: schemaTree, value };
  }, [activeTab, activeConfigValues, schemaTree]);

  const renderBanner = () => {
    if (!scopeNotFound) return null;
    return (
      <ScopeNotFound
        scopeParam={scopeNotFound}
        onEditBase={backToBase}
        onCreated={(scope) => selectScope({ type: 'SCOPE', scope })}
      />
    );
  };

  const banner = renderBanner();

  const importTitle = (() => {
    if (!canManageConfig) {
      return localize('com_admin_cap_no_permission', { cap: SystemCapabilities.MANAGE_CONFIGS });
    }
    if (isDirty) return localize('com_admin_config_shell_import_dirty');
    return undefined;
  })();

  const resetBaseTitle = (() => {
    if (!canManageConfig) {
      return localize('com_admin_cap_no_permission', { cap: SystemCapabilities.MANAGE_CONFIGS });
    }
    if (isDirty) return localize('com_admin_config_reset_base_dirty');
    return undefined;
  })();

  return (
    <ConfigErrorsProvider value={save.fieldErrors}>
      <ExpandProvider resetKey={`${activeTab}|${editingScope?._id ?? 'base'}`}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div className="shrink-0 px-4">
            {banner && <div className="pt-4 pb-2">{banner}</div>}
            <HeaderActions
              showImport={isReady && !scopeNotFound}
              importDisabled={isDirty || !canManageConfig}
              importTitle={importTitle}
              onImportClick={() => imports.setImportOpen(true)}
              showReset={isReady && !isEditingScope && !scopeNotFound && baseOverrides.count > 0}
              resetLabel={localize('com_admin_config_review_reset_button', {
                count: baseOverrides.count,
              })}
              resetDisabled={isDirty || !canManageConfig}
              resetTitle={resetBaseTitle}
              onResetClick={resetBase.openResetBase}
              showScope={permissions.canView}
              scopeSelection={selectedScope}
              scopeLoading={isResolvingScope && !scopeLoadError}
              scopeUnavailable={scopeLoadError != null}
              onScopeClick={() => setScopeSelectorOpen(true)}
            />
            <ConfigTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabBadges={isReady ? tabBadges : undefined}
            />
            {isReady && editingScope && (
              <ScopeBar
                scope={editingScope}
                onBackToBase={backToBase}
                onError={notifyError}
                values={layers.scopeOverrideValues}
                pendingResets={edits.pendingResets}
                onRevert={
                  permissions.canAssign
                    ? (paths) => paths.forEach(edits.handleResetField)
                    : undefined
                }
                onUnhide={permissions.canAssign ? edits.handleUnhideField : undefined}
                visibility={edits.visibilityEdits}
                fields={schemaTree}
                config={activeConfigValues}
                onRevertEntry={permissions.canAssign ? revertScopeEntry : undefined}
                isEntryPending={isScopeEntryPending}
              />
            )}
            {isReady && (
              <ContentToolbar
                scrollContainer={scrollEl}
                filter={filterText}
                onFilterChange={setFilterText}
                filterHits={filterHits}
                onFilterSelect={revealSetting}
                customizedOnly={customizedOnly}
                onCustomizedOnlyChange={setCustomizedOnly}
                jumpTargets={jumpTargets}
                onJump={jumpTo}
                nothingCustomized={layers.activeConfiguredPaths.size === 0}
              />
            )}
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative min-h-0 min-w-0 flex-1">
              <div className="h-full scrollbar-gutter-stable overflow-auto pl-4" ref={setScrollEl}>
                {baseline.status === 'error' && (
                  <ConfigLoadError error={baseline.error} onRetry={baseline.retry} />
                )}
                {baseline.status !== 'error' && scopeLoadError && (
                  <ConfigLoadError
                    error={scopeLoadError}
                    onRetry={retryScopes}
                    titleKey="com_admin_config_shell_scopes_error_title"
                    descriptionKey="com_admin_config_shell_scopes_error_desc"
                  />
                )}
                {baseline.status !== 'error' &&
                  !scopeLoadError &&
                  (baseline.status === 'pending' || isResolvingScope) && <ConfigContentSkeleton />}
                {isReady && (
                  <ScopeActionsProvider value={scopeActions}>
                    <RevealTargetContext.Provider value={highlightField ?? null}>
                      <ConfigTabContent
                        sections={sectionsForActiveTab}
                        configValues={activeConfigValues}
                        editedValues={editedValues}
                        onFieldChange={edits.handleFieldChange}
                        onResetField={edits.handleResetField}
                        onDiscardField={edits.handleDiscardField}
                        previewMode={false}
                        previewScope={editingScope}
                        previewChangedPaths={layers.scopeChangedPaths}
                        resolvedValues={layers.scopeResolvedValues}
                        permissions={permissions}
                        showChangedOnly={false}
                        readOnly={!canEditActiveTab || scopeNotFound != null}
                        configuredPaths={layers.activeConfiguredPaths}
                        dbOverridePaths={layers.overridePaths}
                        listOverrideCounts={layers.listOverrideCounts}
                        touchedPaths={edits.touchedPaths}
                        pendingResets={edits.pendingResets}
                        sectionPermissions={sectionPermissions}
                        schemaDefaults={layers.schemaDefaults}
                        showConfiguredOnly={customizedOnly}
                        isEditingScope={isEditingScope}
                        baseRecordKeys={layers.baseRecordKeys}
                        onValidationError={notifyError}
                        editSessionId={edits.editSessionId}
                        unknownSettings={topLevelUnknown}
                        onShowAll={showAllSettings}
                        filterText={filterText}
                        onClearFilter={clearFilter}
                        visibleSectionIds={filterSectionIds}
                        filterPaths={filterPaths}
                        valueLayers={layers.valueLayers}
                        visibilityEdits={edits.visibilityEdits}
                      />
                    </RevealTargetContext.Provider>
                  </ScopeActionsProvider>
                )}
              </div>
            </div>
            <ConfigTableOfContents
              entries={isReady ? tocEntries : NO_TOC_ENTRIES}
              scrollContainer={scrollEl}
              tocRef={setTocEl}
              showConfiguredOnly={customizedOnly}
              configuredPaths={layers.activeConfiguredPaths}
              onNavigate={setActiveSection}
              dirtyPaths={dirtyPaths}
              errorPaths={errorPaths}
            />
          </div>

          {isReady && <ChangesBar review={review} />}
          <ChangeReview review={review} />

          <ScopeSelector
            open={scopeSelectorOpen}
            onOpenChange={setScopeSelectorOpen}
            currentSelection={selectedScope}
            onSelect={handleScopeChange}
            permissions={permissions}
            onError={notifyError}
            isDirty={isDirty}
          />

          <ImportYamlDialog
            open={imports.importOpen}
            onClose={() => imports.setImportOpen(false)}
            currentScope={editingScope}
            onImport={imports.handleImport}
            schemaTree={schemaTree}
            schemaPathSet={layers.schemaPathSet}
          />

          <NavigationGuardDialog
            open={guard.open}
            intent={guard.intent}
            changeCount={Math.max(review.model.count, 1)}
            onSave={guard.onSave}
            onDiscard={guard.onDiscard}
            onCancel={guard.onCancel}
          />

          <ResetBaseConfigDialog
            open={resetBase.resetBaseOpen}
            resetting={resetBase.resettingBase}
            error={resetBase.resetBaseError}
            onConfirm={resetBase.handleResetBaseConfig}
            onCancel={resetBase.cancelResetBase}
            overrides={baseOverrides}
          />
        </div>
      </ExpandProvider>
    </ConfigErrorsProvider>
  );
}
