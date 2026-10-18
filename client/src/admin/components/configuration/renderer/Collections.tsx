import { useRef, useCallback } from 'react';
import type * as t from '~/admin/types';
import { RecordObjectField } from '../fields/RecordObjectField';
import { ArrayObjectField } from '../fields/ArrayObjectField';
import { renderCollectionEntryFields } from './InlineField';
import { DecorativeIcon } from '~/admin/components/shared';
import { NestedGroup } from './NestedGroup';
import { useLocalize } from '~/admin/hooks';

/** Order matters for these lists (menu order, first-match fallbacks), so their cards can be moved. */
const REORDERABLE_PATHS: ReadonlySet<string> = new Set(['modelSpecs.list']);

/**
 * D2: a list LibreChat replaces whole (model specs) that the open target
 * stores: from the first edit it no longer follows librechat.yaml (or, in a
 * profile, Base). Says so and offers to revert the whole list.
 */
export function ListOwnershipNotice({ isScope, onRevert }: t.ListOwnershipNoticeProps) {
  const localize = useLocalize();
  return (
    <div className="settings-banner mb-3" role="note">
      <span className="settings-banner-icon">
        <DecorativeIcon name="info-in-circle" size="sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="m-0 min-w-0 flex-[1_1_15rem]">
          {localize(isScope ? 'com_admin_config_list_owned_scope' : 'com_admin_config_list_owned')}
        </p>
        {onRevert && (
          <button type="button" className="settings-row-action shrink-0" onClick={onRevert}>
            {localize(
              isScope ? 'com_admin_config_list_revert_scope' : 'com_admin_config_list_revert',
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/** Wrapper that wires a NestedGroup header "+ Add entry" button to
 *  ArrayObjectField's add handler via a ref. */
export function ArrayObjectNestedGroup({
  fieldId,
  fieldLabel,
  path,
  currentValue,
  field,
  onChange,
  disabled,
  isSoleField,
  editSessionId,
  notice,
}: t.CollectionGroupProps) {
  const items = Array.isArray(currentValue) ? currentValue : [];
  const addTriggerRef = useRef<(() => void) | null>(null);
  const handleAdd = disabled ? undefined : () => addTriggerRef.current?.();

  const handleEntryChange = useCallback(
    (index: number, value: t.ConfigValue) => onChange(`${path}.${index}`, value),
    [onChange, path],
  );

  const arrayField = (
    <ArrayObjectField
      id={fieldId}
      path={path}
      value={currentValue}
      fields={field.children ?? []}
      onChange={(v) => onChange(path, v)}
      onEntryChange={handleEntryChange}
      disabled={disabled}
      hideAddButton
      addTriggerRef={addTriggerRef}
      renderFields={renderCollectionEntryFields}
      reorderable={REORDERABLE_PATHS.has(path)}
      editSessionId={editSessionId}
    />
  );
  if (isSoleField) {
    return (
      <>
        {notice}
        {arrayField}
      </>
    );
  }
  return (
    <NestedGroup
      label={fieldLabel}
      sectionId={`section-${path}`}
      configuredCount={items.length}
      totalCount={items.length}
      entries
      depth={field.depth}
      onAdd={handleAdd}
      disabled={disabled}
    >
      {notice}
      {arrayField}
    </NestedGroup>
  );
}

/** Wrapper that wires a NestedGroup header "+ Add entry" button to
 *  RecordObjectField's add-key input via a ref. */
export function RecordObjectNestedGroup({
  fieldId,
  fieldLabel,
  path,
  currentValue,
  field,
  onChange,
  disabled,
  isSoleField,
  editSessionId,
}: t.CollectionGroupProps) {
  const addTriggerRef = useRef<(() => void) | null>(null);
  const handleAdd = disabled ? undefined : () => addTriggerRef.current?.();
  const entryCount =
    currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? Object.keys(currentValue).length
      : 0;

  const recordField = (
    <RecordObjectField
      id={fieldId}
      path={path}
      value={currentValue}
      fields={field.children ?? []}
      onChange={(v) => onChange(path, v)}
      disabled={disabled}
      allowPrimitiveValues={field.recordValueAllowsPrimitive}
      addTriggerRef={addTriggerRef}
      renderFields={renderCollectionEntryFields}
      editSessionId={editSessionId}
    />
  );
  if (isSoleField) return recordField;
  return (
    <NestedGroup
      label={fieldLabel}
      sectionId={`section-${path}`}
      configuredCount={entryCount}
      totalCount={entryCount}
      entries
      depth={field.depth}
      onAdd={handleAdd}
      disabled={disabled}
    >
      {recordField}
    </NestedGroup>
  );
}
