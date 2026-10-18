import { useMemo, useState } from 'react';
import type * as t from '~/admin/types';
import { CreateCustomEndpointDialog } from '../CreateCustomEndpointDialog';
import { ArrayObjectField } from '../../fields/ArrayObjectField';
import { renderParamDefinitionFields } from './ParamDefinitions';
import { useLocalize, useLowerEntryKeys } from '~/admin/hooks';
import { DecorativeIcon } from '~/admin/components/shared';
import { GroupedFieldRenderer } from './GroupedFields';
import { isConfigRecord } from '~/admin/utils';

/** Collection render overrides for custom endpoint nested fields. */
const COLLECTION_RENDER_OVERRIDES: Record<string, t.CollectionRenderFields> = {
  paramDefinitions: renderParamDefinitionFields,
};

/**
 * Custom `renderFields` function for custom endpoint entries.
 * Renders fields in semantic groups instead of a flat list.
 * Matches the `CollectionRenderFields` signature so it can be injected
 * into `ArrayObjectField` and `ObjectEntryCard`.
 */
const LOCKED_NAME: ReadonlySet<string> = new Set(['name']);

/**
 * `lockedNames`: endpoints the layer beneath defines (D1), whose name is
 * shown read-only; a name two entries share is left editable so the
 * duplicate can be fixed.
 */
function makeGroupedEndpointFields(
  disabled: boolean | undefined,
  lockedNames: ReadonlySet<string>,
): t.CollectionRenderFields {
  return (fields, parentValue, parentPath, onChange, _addFieldTriggerRef, editSessionId) => (
    <GroupedFieldRenderer
      groupKey="custom"
      fields={fields}
      parentValue={parentValue}
      parentPath={parentPath}
      onChange={onChange}
      disabled={disabled}
      collectionRenderOverrides={COLLECTION_RENDER_OVERRIDES}
      editSessionId={editSessionId}
      lockedKeys={
        isConfigRecord(parentValue) && lockedNames.has(String(parentValue.name))
          ? LOCKED_NAME
          : undefined
      }
    />
  );
}

const NAME_SEPARATOR = '\u0000';

/** A draft in the create dialog is a new entry: nothing in it is locked, so a taken name can be corrected. */
const NO_LOCKED_NAMES: ReadonlySet<string> = new Set();

/** Names the layer beneath defines that exactly one current entry carries, joined (a stable memo key). */
function uniqueLowerNames(items: t.ConfigValue[], lowerNames: ReadonlySet<string>): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!isConfigRecord(item) || typeof item.name !== 'string') continue;
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  }
  return [...lowerNames].filter((name) => counts.get(name) === 1).join(NAME_SEPARATOR);
}

export function CustomEndpointsRenderer(props: t.FieldRendererProps) {
  const { fields, parentPath, parentValue, getValue, onChange, disabled, editSessionId } = props;
  const localize = useLocalize();
  const [createOpen, setCreateOpen] = useState(false);
  const lowerNames = useLowerEntryKeys(`${parentPath}.custom`, 'name');
  const customField = fields.find((f) => f.key === 'custom');
  const path = `${parentPath}.custom`;
  const parentObj =
    parentValue && typeof parentValue === 'object' && !Array.isArray(parentValue)
      ? (parentValue as Record<string, t.ConfigValue>)
      : {};
  const value = getValue(path, parentObj.custom ?? []);
  const items = Array.isArray(value) ? value : [];
  const lockedNames = uniqueLowerNames(items, lowerNames);
  const renderGroupedEndpointFields = useMemo(
    () =>
      makeGroupedEndpointFields(
        disabled,
        lockedNames ? new Set(lockedNames.split(NAME_SEPARATOR)) : NO_LOCKED_NAMES,
      ),
    [disabled, lockedNames],
  );
  const renderDraftFields = useMemo(
    () => makeGroupedEndpointFields(disabled, NO_LOCKED_NAMES),
    [disabled],
  );

  if (!customField) return null;

  const handleCreate = (entry: t.ConfigRecord) => {
    onChange(path, [...items, entry]);
  };
  const existingNames = new Set(
    items.flatMap((item) =>
      isConfigRecord(item) && typeof item.name === 'string' ? [item.name.trim()] : [],
    ),
  );

  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {!disabled && (
        <div className="flex items-center gap-3 py-2">
          <button type="button" onClick={() => setCreateOpen(true)} className="config-add-btn">
            <DecorativeIcon name="plus" size="sm" />
            <span>{localize('com_admin_config_create_endpoint')}</span>
          </button>
        </div>
      )}
      {disabled && isEmpty ? (
        <div className="py-3 text-sm text-(--cui-color-text-muted)">
          {localize('com_admin_config_no_custom_endpoints')}
        </div>
      ) : (
        <ArrayObjectField
          id={`${path.replace(/\./g, '-')}`}
          path={path}
          value={value}
          fields={customField.children ?? []}
          onChange={(v) => onChange(path, v)}
          onEntryChange={(index, v) => onChange(`${path}.${index}`, v)}
          disabled={disabled}
          hideAddButton
          renderFields={renderGroupedEndpointFields}
          entryIdPrefix={`section-${path.split('.')[0]}-custom`}
          isEntryLocked={(item) => isConfigRecord(item) && lowerNames.has(String(item.name))}
          editSessionId={editSessionId}
        />
      )}
      <CreateCustomEndpointDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        fields={customField.children ?? []}
        existingNames={existingNames}
        renderFields={renderDraftFields}
      />
    </div>
  );
}
