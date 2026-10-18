import { useMemo, useContext } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type * as t from '~/admin/types';
import { countSection, countSectionOverrides, countEntrySectionOverrides } from './counts';
import { SECTION_RENDERERS, SELF_CONTAINED_SECTION_RENDERERS } from './sections';
import { ConfigValuesProvider } from '~/admin/contexts/ConfigValuesContext';
import { RevealTargetContext } from '~/admin/contexts/RevealTargetContext';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { deriveFieldValue, isSectionDisabled } from '~/admin/utils';
import { FieldRenderer, SingleFieldRenderer } from './renderer';
import { ReadOnlySection } from './ReadOnlySection';
import { UnknownSettings } from './UnknownSettings';
import { ConfigSection } from './ConfigSection';
import { isPathInSection } from './configMeta';
import { CodeField } from './fields/CodeField';
import { useLocalize } from '~/admin/hooks';
import { InfoBanner } from './InfoBanner';
import { ScopeGate } from './ScopeGate';
import { Button } from '~/admin/ui';

/**
 * Enter in an input of the tab form must never submit it (and so "click" its
 * default button). Dialogs portaled from the tab (Create MCP server, Create
 * endpoint) are left alone: their keydown bubbles here through the React
 * tree, but they live outside the form's DOM and keep Enter-to-submit.
 */
function preventImplicitSubmit(event: KeyboardEvent<HTMLFormElement>) {
  const { target } = event;
  if (event.key !== 'Enter' || !(target instanceof HTMLInputElement)) return;
  if (event.currentTarget.contains(target)) event.preventDefault();
}

/** One row's worth of field: a scalar or a list of scalars (no nested fields, records or objects). */
function isSimpleScalar(f: t.SchemaField): boolean {
  return !f.children?.length && f.type !== 'record' && f.type !== 'object';
}

function EmptyTabState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-(--cui-color-text-muted)">
      <span className="text-sm">{message}</span>
      {action}
    </div>
  );
}

export function ConfigTabContent({
  sections,
  configValues,
  editedValues,
  onFieldChange,
  onResetField,
  onDiscardField,
  previewMode,
  previewScope,
  previewChangedPaths,
  resolvedValues,
  permissions,
  showChangedOnly,
  readOnly,
  configuredPaths,
  dbOverridePaths,
  listOverrideCounts,
  touchedPaths,
  pendingResets,
  sectionPermissions,
  schemaDefaults,
  showConfiguredOnly,
  isEditingScope,
  baseRecordKeys,
  onValidationError,
  editSessionId,
  unknownSettings,
  valueLayers,
  visibilityEdits,
  visibleSectionIds,
  filterPaths,
  filterText,
  onClearFilter,
  onShowAll,
}: t.ConfigTabContentProps) {
  const localize = useLocalize();
  const revealTarget = useContext(RevealTargetContext);
  const fieldsDisabled = readOnly;

  const filtering = showChangedOnly;

  const sectionHasChanges = useMemo(() => {
    if (!filtering || !previewChangedPaths) return null;
    const pathSet = new Set(previewChangedPaths);
    const result: Record<string, boolean> = {};
    for (const section of sections) {
      result[section.id] = section.sectionField
        ? pathSet.has(section.id)
        : hasChangedDescendant(section.fields, section.id, pathSet);
    }
    return result;
  }, [filtering, previewChangedPaths, sections]);

  /**
   * Counted over the fields each section shows (custom endpoints and providers
   * split `endpoints`). In a profile a section's count already is what it
   * sets, so only collections add the entries it overrides or hides.
   */
  const sectionCounts = useMemo(() => {
    const overridesOf = (section: t.ConfigSectionConfig): number => {
      if (isEditingScope && configuredPaths) {
        return countEntrySectionOverrides(section, configuredPaths, listOverrideCounts) ?? 0;
      }
      if (!dbOverridePaths) return 0;
      return countSectionOverrides(section, dbOverridePaths, listOverrideCounts);
    };
    return sections.map((s) => {
      const dataKey = s.schemaKey ?? s.id;
      const fields = s.fields.filter((f) => isPathInSection(s.id, dataKey, `${dataKey}.${f.key}`));
      const section = { ...s, fields };
      return {
        id: s.id,
        ...countSection(section, configuredPaths, configValues),
        overrides: overridesOf(section),
      };
    });
  }, [
    sections,
    configuredPaths,
    configValues,
    isEditingScope,
    dbOverridePaths,
    listOverrideCounts,
  ]);

  const countsById = useMemo(() => {
    const map: Record<string, t.SectionCount> = {};
    for (const { id, ...count } of sectionCounts) map[id] = count;
    return map;
  }, [sectionCounts]);

  const valuesData = useMemo<t.ConfigValuesData>(
    () => ({
      configValues,
      editedValues,
      resolvedValues,
      schemaDefaults,
      configuredPaths,
      overridePaths: dbOverridePaths,
      pendingResets,
      isEditingScope,
      layers: valueLayers,
      visibilityEdits,
    }),
    [
      configValues,
      editedValues,
      resolvedValues,
      schemaDefaults,
      configuredPaths,
      dbOverridePaths,
      pendingResets,
      isEditingScope,
      valueLayers,
      visibilityEdits,
    ],
  );

  const getValue = (path: string, fallback: t.ConfigValue): t.ConfigValue =>
    deriveFieldValue(path, fallback, valuesData);

  if (sections.length === 0) {
    return (
      <div className="py-6">
        <CodeField
          id="config-raw"
          value={configValues}
          onChange={(v) => onFieldChange('_root', v)}
        />
      </div>
    );
  }

  let visibleSections =
    filtering && sectionHasChanges ? sections.filter((s) => sectionHasChanges[s.id]) : sections;

  if (showConfiguredOnly && !previewMode) {
    visibleSections = visibleSections.filter((s) => (countsById[s.id]?.configured ?? 0) > 0);
  }

  if (visibleSectionIds) {
    visibleSections = visibleSections.filter((s) => visibleSectionIds.has(s.id));
  }

  if (visibleSections.length === 0 && filtering) {
    return <EmptyTabState message={localize('com_admin_scope_no_changed_in_tab')} />;
  }

  if (visibleSections.length === 0 && visibleSectionIds) {
    return (
      <EmptyTabState
        message={localize('com_admin_config_shell_filter_empty', { query: filterText ?? '' })}
        action={
          onClearFilter && (
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_config_shell_clear_filter')}
              onClick={onClearFilter}
            />
          )
        }
      />
    );
  }

  if (visibleSections.length === 0 && showConfiguredOnly) {
    return (
      <EmptyTabState
        message={localize('com_admin_config_shell_nothing_customized')}
        action={
          onShowAll && (
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_config_shell_show_all')}
              onClick={onShowAll}
            />
          )
        }
      />
    );
  }

  const renderSectionContent = (section: t.ConfigSectionConfig) => {
    const dataKey = section.schemaKey ?? section.id;
    const sectionValue = configValues?.[dataKey];
    const sectionDisabled =
      section.scopeGate != null ||
      section.readOnlyReason != null ||
      isSectionDisabled(!!fieldsDisabled, sectionPermissions, dataKey);
    const CustomSectionRenderer =
      section.fields.length > 0 ? SECTION_RENDERERS[section.id] : undefined;
    const fieldRendererProps: t.FieldRendererProps = {
      fields: section.fields,
      parentValue: sectionValue,
      parentPath: dataKey,
      getValue,
      onChange: onFieldChange,
      onResetField,
      onDiscardField,
      editedValues,
      disabled: sectionDisabled,
      previewMode,
      previewScope,
      previewChangedPaths,
      resolvedValues,
      permissions,
      showChangedOnly,
      configuredPaths,
      dbOverridePaths,
      touchedPaths,
      pendingResets,
      schemaDefaults,
      showConfiguredOnly,
      isEditingScope,
      yamlBaseKeys: baseRecordKeys?.[dataKey],
      onValidationError,
      editSessionId,
    };
    const content = (
      <>
        {section.bannerText && !section.readOnlyReason && !section.scopeGate && (
          <div className="mb-4">
            <InfoBanner
              text={section.bannerText}
              link={section.bannerLink}
              dismissible
              dismissKey={`section:${section.id}`}
            />
          </div>
        )}
        {section.fields.length > 0 &&
          (CustomSectionRenderer ? (
            <CustomSectionRenderer {...fieldRendererProps} />
          ) : (
            <FieldRenderer {...fieldRendererProps} />
          ))}
        {section.fields.length > 0 &&
          !CustomSectionRenderer &&
          !section.isRecord &&
          !filterPaths && (
            <UnknownSettings fields={section.fields} value={sectionValue} path={dataKey} />
          )}
        {section.fields.length === 0 && section.sectionField && (
          <SingleFieldRenderer
            field={section.sectionField}
            value={sectionValue}
            path={section.id}
            getValue={getValue}
            onChange={onFieldChange}
            onResetField={onResetField}
            disabled={sectionDisabled}
            permissions={permissions}
            previewMode={previewMode}
            previewScope={previewScope}
            previewChangedPaths={previewChangedPaths}
            resolvedValues={resolvedValues}
            configuredPaths={configuredPaths}
            dbOverridePaths={dbOverridePaths}
            touchedPaths={touchedPaths}
            pendingResets={pendingResets}
            schemaDefaults={schemaDefaults}
            showConfiguredOnly={showConfiguredOnly}
            isSoleField={!section.sectionField.isArray && section.sectionField.type !== 'record'}
          />
        )}
        {section.fields.length === 0 && !section.sectionField && (
          <CodeField
            id={`${section.id}-raw`}
            value={sectionValue}
            onChange={(v) => onFieldChange(section.id, v)}
            disabled={sectionDisabled}
          />
        )}
      </>
    );
    if (section.scopeGate) {
      return (
        <ScopeGate
          reason={section.scopeGate}
          title={section.title ?? localize(section.titleKey)}
          section={dataKey}
        >
          {content}
        </ScopeGate>
      );
    }
    if (!section.readOnlyReason) return content;
    const isEmpty = countsById[section.id]?.configured === 0;
    const reveal =
      revealTarget != null && (revealTarget === dataKey || revealTarget.startsWith(`${dataKey}.`));
    return (
      <ReadOnlySection
        reason={section.readOnlyReason}
        isEmpty={isEmpty && !filterPaths}
        reveal={reveal}
      >
        {content}
      </ReadOnlySection>
    );
  };

  const isInlineSection = (section: t.ConfigSectionConfig): boolean =>
    Boolean(
      (section.sectionField && isSimpleScalar(section.sectionField)) ||
        (section.fields.length === 1 && isSimpleScalar(section.fields[0])),
    );

  type SectionGroup =
    | { kind: 'inline'; section: t.ConfigSectionConfig }
    | { kind: 'accordion'; sections: t.ConfigSectionConfig[] }
    | { kind: 'flat'; section: t.ConfigSectionConfig };

  const groups = visibleSections.reduce<SectionGroup[]>((acc, section) => {
    if (SELF_CONTAINED_SECTION_RENDERERS.has(section.id)) {
      acc.push({ kind: 'flat', section });
      return acc;
    }
    if (isInlineSection(section)) {
      acc.push({ kind: 'inline', section });
      return acc;
    }
    const last = acc[acc.length - 1];
    if (last?.kind === 'accordion') {
      last.sections.push(section);
    } else {
      acc.push({ kind: 'accordion', sections: [section] });
    }
    return acc;
  }, []);

  return (
    <ConfigValuesProvider value={valuesData}>
      <RowFilterContext.Provider value={filterPaths ?? null}>
        <form
          aria-label={localize('com_admin_nav_configuration')}
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={preventImplicitSubmit}
          className="settings-content flex flex-col gap-4 py-4"
        >
          <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />
          {groups.map((group) => {
            if (group.kind === 'flat') {
              return (
                <div key={group.section.id} id={`section-${group.section.id}`}>
                  {renderSectionContent(group.section)}
                </div>
              );
            }
            if (group.kind === 'inline') {
              const { section } = group;
              const counts = countsById[section.id];
              return (
                <ConfigSection
                  key={section.id}
                  sectionId={section.id}
                  title={section.title ?? localize(section.titleKey)}
                  description={
                    section.descriptionKey ? localize(section.descriptionKey) : undefined
                  }
                  learnMoreUrl={section.learnMoreUrl}
                  configuredCount={counts?.configured ?? 0}
                  totalCount={counts?.total ?? 0}
                  countsEntries={counts?.entries}
                  overrideCount={counts?.overrides}
                  inline
                  showConfiguredOnly={showConfiguredOnly}
                >
                  {renderSectionContent(section)}
                </ConfigSection>
              );
            }
            return group.sections.map((section) => {
              const counts = countsById[section.id];
              return (
                <ConfigSection
                  key={section.id}
                  sectionId={section.id}
                  title={section.title ?? localize(section.titleKey)}
                  description={
                    section.descriptionKey ? localize(section.descriptionKey) : undefined
                  }
                  learnMoreUrl={section.learnMoreUrl}
                  configuredCount={counts?.configured ?? 0}
                  totalCount={counts?.total ?? 0}
                  countsEntries={counts?.entries}
                  overrideCount={counts?.overrides}
                  defaultExpanded
                  showConfiguredOnly={showConfiguredOnly}
                >
                  {renderSectionContent(section)}
                </ConfigSection>
              );
            });
          })}
          {unknownSettings && !filterPaths && (
            <UnknownSettings
              fields={unknownSettings.fields}
              value={unknownSettings.value}
              path=""
            />
          )}
        </form>
      </RowFilterContext.Provider>
    </ConfigValuesProvider>
  );
}

function hasChangedDescendant(
  fields: t.SchemaField[],
  parentPath: string,
  pathSet: Set<string>,
): boolean {
  for (const field of fields) {
    const path = `${parentPath}.${field.key}`;
    if (pathSet.has(path)) return true;
    if (field.children && field.children.length > 0) {
      if (hasChangedDescendant(field.children, path, pathSet)) return true;
    }
  }
  return false;
}
