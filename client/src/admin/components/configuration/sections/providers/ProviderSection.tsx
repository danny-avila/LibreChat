import { useContext } from 'react';
import type * as t from '~/admin/types';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { countConfigured, hasDescendant } from '../../counts';
import { FieldRenderer, NestedGroup } from '../../renderer';
import { UnknownSettings } from '../../UnknownSettings';
import { ConfigSection } from '../../ConfigSection';
import { isConfigRecord } from '~/admin/utils';
import { InfoBanner } from '../../InfoBanner';
import { useLocalize } from '~/admin/hooks';

/** Shown at the top of every named-provider section, in this order. */
const PRIORITY_ORDER = ['disabled', 'apiKey', 'baseURL', 'models', 'name'] as const;

export function ProviderSection({
  field,
  parentPath,
  parentValue,
  getValue,
  onChange,
  onResetField,
  onDiscardField,
  editedValues,
  disabled,
  permissions,
  configuredPaths,
  dbOverridePaths,
  touchedPaths,
  pendingResets,
  schemaDefaults,
  showConfiguredOnly,
  previewMode,
  previewScope,
  previewChangedPaths,
  resolvedValues,
  showChangedOnly,
  editSessionId,
}: t.ProviderSectionProps) {
  const localize = useLocalize();
  const rowFilter = useContext(RowFilterContext);

  const path = `${parentPath}.${field.key}`;
  const children = field.children ?? [];
  const parentObj =
    parentValue && typeof parentValue === 'object' && !Array.isArray(parentValue)
      ? (parentValue as Record<string, t.ConfigValue>)
      : {};
  const providerValue = parentObj[field.key] ?? {};

  const { total, configured } = countConfigured(children, path, configuredPaths);

  const priorityChildren = PRIORITY_ORDER.map((k) => children.find((c) => c.key === k)).filter(
    (f): f is t.SchemaField => f != null,
  );

  const hasPrioritySplit = priorityChildren.length > 0;
  const priorityKeys = new Set(priorityChildren.map((c) => c.key));
  const restChildren = hasPrioritySplit
    ? children.filter((c) => !priorityKeys.has(c.key))
    : children;

  const restConfigured = restChildren.reduce((acc, c) => {
    const p = `${path}.${c.key}`;
    return acc + (configuredPaths?.has(p) || hasDescendant(p, configuredPaths) ? 1 : 0);
  }, 0);

  const label = localize(`com_admin_config_field_${field.key}`);
  /** D11: while `endpoints.all` exists, LibreChat reads title settings only from it. */
  const hasGlobalBlock =
    field.key !== 'all' && isConfigRecord(getValue(`${parentPath}.all`, parentObj.all));

  const rendererProps: Omit<t.FieldRendererProps, 'fields'> = {
    parentValue: providerValue,
    parentPath: path,
    getValue,
    onChange,
    onResetField,
    onDiscardField,
    editedValues,
    disabled,
    permissions,
    configuredPaths,
    dbOverridePaths,
    touchedPaths,
    pendingResets,
    schemaDefaults,
    showConfiguredOnly,
    previewMode,
    previewScope,
    previewChangedPaths,
    resolvedValues,
    showChangedOnly,
    editSessionId,
  };

  return (
    <ConfigSection
      sectionId={path}
      title={label}
      configuredCount={configured}
      totalCount={total}
      showConfiguredOnly={showConfiguredOnly}
    >
      {hasGlobalBlock && (
        <div className="mb-3">
          <InfoBanner
            text={localize('com_admin_config_global_titles_banner')}
            dismissible={false}
          />
        </div>
      )}
      {hasPrioritySplit ? (
        <>
          <FieldRenderer fields={priorityChildren} {...rendererProps} />
          {restChildren.length > 0 && (
            <NestedGroup
              label={localize('com_admin_config_more_settings')}
              totalCount={restChildren.length}
              configuredCount={restConfigured}
              depth={2}
              disabled={rendererProps.disabled}
              revealPaths={restChildren.map((child) => `${path}.${child.key}`)}
            >
              <FieldRenderer fields={restChildren} {...rendererProps} />
            </NestedGroup>
          )}
        </>
      ) : (
        <FieldRenderer fields={children} {...rendererProps} />
      )}
      {!rowFilter && <UnknownSettings fields={children} value={providerValue} path={path} />}
    </ConfigSection>
  );
}
