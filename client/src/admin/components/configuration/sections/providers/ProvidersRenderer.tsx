import { useContext } from 'react';
import type * as t from '~/admin/types';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { ProviderSection } from './ProviderSection';
import { FieldRenderer } from '../../renderer';
import { countConfigured } from '../../counts';
import { isRowVisible } from '~/admin/utils';

export function ProvidersRenderer(props: t.FieldRendererProps) {
  const {
    fields,
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
  } = props;
  const rowFilter = useContext(RowFilterContext);

  const providerFields = fields.filter(
    (f) =>
      f.key !== 'custom' &&
      f.children &&
      f.children.length > 0 &&
      isRowVisible(rowFilter, `${parentPath}.${f.key}`),
  );

  const otherFields = fields.filter(
    (f) => f.key !== 'custom' && (!f.children || f.children.length === 0),
  );

  const sharedProps: Omit<t.ProviderSectionProps, 'field'> = {
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
  };

  const visibleProviders = showConfiguredOnly
    ? providerFields.filter((f) => {
        const { configured } = countConfigured(
          f.children ?? [],
          `${parentPath}.${f.key}`,
          configuredPaths,
        );
        return configured > 0;
      })
    : providerFields;

  return (
    <div className="flex flex-col gap-4">
      {visibleProviders.map((field) => (
        <ProviderSection key={field.key} field={field} {...sharedProps} />
      ))}

      {otherFields.length > 0 && <FieldRenderer fields={otherFields} {...sharedProps} />}
    </div>
  );
}
