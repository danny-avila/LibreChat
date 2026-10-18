import { useRef } from 'react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import {
  ListOwnershipNotice,
  ArrayObjectNestedGroup,
  RecordObjectNestedGroup,
} from './Collections';
import { fieldDescription, hasPathOrDescendant, isContainerKind, toFieldId } from './paths';
import { useLocalize, useFieldState, useValuesScope } from '~/admin/hooks';
import { getKeyedCollection, isConfigValueEqual } from '~/admin/utils';
import { fieldMetaFor, fieldVariants, resolveControl } from './kinds';
import { deriveFieldDefault, lowerLayerKeys } from './defaults';
import { BooleanChip, FieldControl } from './FieldControl';
import { TriStateField } from '../fields/TriStateField';
import { VariantField } from '../fields/VariantField';
import { InlineFieldRenderer } from './InlineField';
import { ToggleField } from '../fields/ToggleField';
import { getDefaultHint } from '../controls';
import { ConfigRow } from '../ConfigRow';
import { labelForPath } from '../meta';

/** Controls whose "Default (…)" choice names the default, so the row hint is dropped while it is selected. */
const SHOWS_DEFAULT_CHOICE: ReadonlySet<t.ControlKind> = new Set([
  'tristate',
  'select',
  'switch-object',
  'bool-or-list',
  'scalar-union',
]);

/** Inputs that show a default nothing sets as their placeholder ("Default: 1,800,000"), like entry cards do. */
const PLACEHOLDER_DEFAULT_KINDS: ReadonlySet<t.ControlKind> = new Set([
  'number',
  'text',
  'secret',
  'textarea',
  'ref-select',
]);

function isPlainRecord(value: t.ConfigValue): value is t.ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** On/off reading of a `boolean | object` value: an object means enabled. */
function asEnabled(value: t.ConfigValue): boolean | undefined {
  if (value === true || isPlainRecord(value)) return true;
  if (value === false) return false;
  return undefined;
}

/**
 * One top-level settings row: label, help, state markers and Reset from
 * `ConfigRow`, and the control from `FieldControl`. Inside a single-field
 * section the row lends its control and chips to the section card (WS6
 * `SoleFieldContext`), so the field keeps its markers, hint and Reset without
 * a second label. Record, object and code values count as configured and
 * overridden when any leaf under them is.
 */
export function SingleFieldRenderer({
  field,
  value,
  path,
  getValue,
  onChange,
  onResetField,
  onDiscardField,
  editedValues,
  disabled,
  permissions,
  previewMode,
  previewScope,
  previewChangedPaths,
  resolvedValues,
  configuredPaths,
  dbOverridePaths,
  touchedPaths,
  pendingResets,
  schemaDefaults,
  showConfiguredOnly,
  isSoleField,
  secretPreviewValue,
  editSessionId,
}: t.SingleFieldRendererProps) {
  const localize = useLocalize();
  const state = useFieldState(path);
  const valuesScope = useValuesScope();
  const lastObjectRef = useRef<t.ConfigRecord | null>(null);
  const currentValue = getValue(path, value);
  const meta = fieldMetaFor(field, path);
  const { kind } = resolveControl({ field, path, value: currentValue });
  const fieldId = toFieldId(path);
  const label = labelForPath(path, localize);
  const description = fieldDescription(field, meta, localize);
  const container = isContainerKind(kind);
  const isConfigured = container
    ? hasPathOrDescendant(path, configuredPaths)
    : (configuredPaths?.has(path) ?? false);
  const isDbOverride = container
    ? hasPathOrDescendant(path, dbOverridePaths)
    : (dbOverridePaths?.has(path) ?? false);
  const isTouched = touchedPaths?.has(path) ?? false;
  const isPendingReset = state.isPendingReset || (pendingResets?.has(path) ?? false);
  const hasPendingEdit = editedValues ? path in editedValues : false;
  const schemaDefault = schemaDefaults?.[path];
  const fieldDefault = deriveFieldDefault(
    {
      ...state,
      isOverride: state.isOverride || isDbOverride,
      isEdited: state.isEdited || hasPendingEdit,
      isPendingReset,
    },
    meta,
    schemaDefault,
  );
  /** A control whose Default choice names the default needs no hint (and the row keeps its height when edited). */
  const defaultHint = SHOWS_DEFAULT_CHOICE.has(kind)
    ? null
    : getDefaultHint(field, schemaDefault, localize);

  /**
   * A secret the target stores is redacted to its masked preview; whatever the
   * value reads as underneath (the librechat.yaml env reference) is not it, so
   * the row shows the preview with Replace instead.
   */
  const showsStoredSecret =
    secretPreviewValue != null && !isPendingReset && (value == null || value === '');

  /** The schema default filled into the tree is not a value anyone set: the input stays empty with it as the placeholder. */
  const showsDefaultAsPlaceholder =
    !fieldDefault.hasOwnValue &&
    PLACEHOLDER_DEFAULT_KINDS.has(kind) &&
    (fieldDefault.source === 'default' || fieldDefault.source === 'runtimeDefault') &&
    isConfigValueEqual(currentValue, fieldDefault.value);
  const shownValue = (() => {
    if (showsStoredSecret && !hasPendingEdit) return '';
    return showsDefaultAsPlaceholder ? undefined : currentValue;
  })();

  if (isPlainRecord(currentValue)) lastObjectRef.current = currentValue;
  if (showConfiguredOnly && !hasPathOrDescendant(path, configuredPaths)) return null;

  /**
   * "Default": remove the target's own value, or drop a pending edit when it
   * has none. Returns false when a librechat.yaml (or Base) value remains,
   * which cannot be removed from here (D3).
   */
  const clear = (): boolean => {
    if (isDbOverride || state.isOverride) {
      onChange(path, undefined);
      return true;
    }
    /** Emptying a list the layer beneath sets: it can't be emptied, and its earlier pending removals stay. */
    const keepsPendingList =
      isConfigured && !SHOWS_DEFAULT_CHOICE.has(kind) && Array.isArray(editedValues?.[path]);
    if (keepsPendingList) return false;
    if (hasPendingEdit && onDiscardField) onDiscardField(path);
    else if (hasPendingEdit) onChange(path, undefined);
    /** A profile can't empty what it inherits: the control says so instead of silently refilling. */
    const inheritsValue = state.source === 'inherited' && state.effective !== undefined;
    return !isConfigured && (hasPendingEdit || !inheritsValue);
  };

  const rowProps = {
    fieldPath: path,
    permissions,
    onResetField,
    onDiscardField,
    previewMode,
    previewScope,
    previewChangedPaths,
    resolvedValues,
    isConfigured,
    isDbOverride,
    isTouched,
    isPendingReset,
    defaultHint,
  };

  if (kind === 'array-object') {
    const ownsList =
      getKeyedCollection(path)?.merge === 'replace' &&
      (isDbOverride || state.isOverride) &&
      !isPendingReset;
    return (
      <ArrayObjectNestedGroup
        notice={
          ownsList ? (
            <ListOwnershipNotice
              isScope={valuesScope != null}
              onRevert={
                !disabled && permissions?.canEdit !== false && onResetField
                  ? () => onResetField(path)
                  : undefined
              }
            />
          ) : undefined
        }
        fieldId={fieldId}
        fieldLabel={label}
        path={path}
        currentValue={currentValue}
        field={field}
        onChange={onChange}
        disabled={disabled}
        isSoleField={isSoleField}
        editSessionId={editSessionId}
      />
    );
  }

  if (kind === 'record-object') {
    return (
      <RecordObjectNestedGroup
        fieldId={fieldId}
        fieldLabel={label}
        path={path}
        currentValue={currentValue}
        field={field}
        onChange={onChange}
        disabled={disabled}
        isSoleField={isSoleField}
        editSessionId={editSessionId}
      />
    );
  }

  const { variants, discriminator } = fieldVariants(field, localize);

  let control: ReactNode;
  if (kind === 'variant' && variants.length > 0) {
    control = (
      <VariantField
        key={`${fieldId}-${editSessionId ?? 0}`}
        id={fieldId}
        value={currentValue}
        variants={variants}
        discriminator={discriminator}
        inheritedKeys={lowerLayerKeys(state)}
        onChange={(next) => onChange(path, next)}
        disabled={disabled}
        aria-label={label}
        renderFields={(variantFields, variantValue, onVariantChange) => (
          <InlineFieldRenderer
            fields={variantFields}
            parentValue={variantValue}
            parentPath={path}
            onChange={onVariantChange}
            disabled={disabled}
            editSessionId={editSessionId}
          />
        )}
      />
    );
  } else if (kind === 'switch-object') {
    const enabled = asEnabled(currentValue);
    const defaultEnabled = asEnabled(fieldDefault.value);
    const setEnabled = (next: boolean | undefined) => {
      if (next === undefined) clear();
      else onChange(path, next ? (lastObjectRef.current ?? true) : false);
    };
    if (disabled) control = <BooleanChip value={enabled ?? defaultEnabled ?? false} />;
    else if (field.isOptional) {
      control = (
        <TriStateField
          id={fieldId}
          value={fieldDefault.hasOwnValue ? enabled : undefined}
          defaultValue={defaultEnabled}
          defaultSource={fieldDefault.source}
          defaultFromGlobal={fieldDefault.fromGlobal}
          unsetLabel={meta?.defaultLabelKey ? localize(meta.defaultLabelKey) : undefined}
          onChange={setEnabled}
          aria-label={label}
        />
      );
    } else {
      control = (
        <ToggleField
          id={fieldId}
          checked={enabled ?? defaultEnabled ?? false}
          onChange={setEnabled}
          aria-label={label}
        />
      );
    }
  } else {
    control = (
      <FieldControl
        key={kind === 'secret' ? `${fieldId}-${editSessionId ?? 0}` : undefined}
        field={field}
        path={path}
        id={fieldId}
        label={label}
        value={shownValue}
        onChange={(next) => onChange(path, next)}
        onClear={clear}
        fieldDefault={fieldDefault}
        disabled={disabled}
        required={!field.isOptional}
        secretPreview={showsStoredSecret ? secretPreviewValue : null}
        hasPendingEdit={hasPendingEdit}
        onCancelSecret={() => onDiscardField?.(path)}
        editSessionId={editSessionId}
      />
    );
  }

  return (
    <ConfigRow
      title={label}
      description={description}
      learnMoreUrl={meta?.docsUrl}
      disabled={disabled}
      fieldId={fieldId}
      {...rowProps}
    >
      {control}
    </ConfigRow>
  );
}
