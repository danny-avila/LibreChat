import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import {
  useLocalize,
  useFieldState,
  useRevertLabels,
  useValuesScope,
  useFieldProfiles,
  useHasValueLayers,
} from '~/admin/hooks';
import {
  ShadowBadge,
  showsShadow,
  sourceLabel,
  FieldProvenance,
  formatConfigValue,
} from './values';
import { ProfileIndicator } from './ProfileIndicator';
import { StateChip } from '~/admin/components/shared';
import { inferControlWidth } from './width';
import { SettingsRow } from './SettingsRow';
import { getFieldMeta } from './meta';

/** Provenance from the field state, falling back to the row's own flags outside a values provider. */
function resolveSource(
  state: t.FieldState,
  isDbOverride: boolean | undefined,
  isConfigured: boolean | undefined,
): t.ProvenanceSource {
  if (state.source !== 'default') return state.source;
  if (isDbOverride) return 'admin';
  if (isConfigured) return 'yaml';
  return 'default';
}

/**
 * A schema field's row (VS-1): full contrast whatever its state, with chips
 * for where the value comes from (librechat.yaml, Override, a profile,
 * Inherited; WS4's provenance chip with its layer stack) or what is pending
 * (Edited with Undo, Pending revert, Error). Default values carry no chip; the
 * "Default: …" hint under the label says so.
 */
export function ConfigRow({
  title,
  description,
  learnMoreUrl,
  badge,
  children,
  disabled,
  hidden,
  fieldId,
  fieldPath,
  previewScope,
  previewChangedPaths,
  permissions,
  onResetField,
  onDiscardField,
  isConfigured,
  isDbOverride,
  isPendingReset,
  defaultHint,
  controlWidth,
  required,
  error,
}: t.ConfigRowProps) {
  const localize = useLocalize();
  const state = useFieldState(fieldPath ?? '');
  const hasLayers = useHasValueLayers();
  const revertLabels = useRevertLabels(fieldPath ?? '', title);
  const overriddenBy = useFieldProfiles(fieldPath);
  const valuesScope = useValuesScope();
  if (hidden) return null;

  const isPending = Boolean(isPendingReset) || state.isPendingReset;
  const isEdited = !isPending && state.isEdited;
  const errorText = error ?? state.error;
  const source = resolveSource(state, isDbOverride, isConfigured);
  const undo = fieldPath && onDiscardField ? () => onDiscardField(fieldPath) : undefined;
  const undoLabel = localize('com_admin_config_ui_undo_change', { name: title });

  const isChanged = fieldPath != null && previewChangedPaths?.includes(fieldPath);
  /** A stored override LibreChat ignores can be removed even where the section is read-only (D5). */
  const canReset =
    !isPending &&
    !isEdited &&
    (isDbOverride || state.isOverride || isChanged) &&
    fieldPath &&
    (!disabled || state.ignoredOverride) &&
    permissions?.canEdit &&
    onResetField;

  /** Outside a values provider with layers, the row's own flags decide the chip. */
  const fallbackProvenanceChip = (): ReactNode => {
    if (source === 'admin') {
      return (
        <StateChip
          kind="override"
          description={localize('com_admin_config_ui_state_override_desc')}
        />
      );
    }
    if (source === 'scope') {
      return (
        <StateChip
          kind="scope"
          label={previewScope?.name}
          description={localize('com_admin_config_ui_state_scope_desc')}
        />
      );
    }
    if (source === 'yaml') {
      return (
        <StateChip kind="yaml" description={localize('com_admin_config_ui_state_yaml_desc')} />
      );
    }
    if (source === 'inherited' && state.effective !== undefined) {
      return (
        <StateChip
          kind="inherited"
          description={localize('com_admin_config_ui_state_inherited_desc')}
        />
      );
    }
    return null;
  };

  /** What the value was before the pending change: for a pending hide, what the profile inherited. */
  const savedValue = (): t.RevertTarget | undefined => {
    if (state.visibilityEdit === 'hide') return state.inherited;
    if (state.isHidden) return undefined;
    return { value: state.effective, source: state.source };
  };

  /** The Edited chip keeps what the value was and where it came from ("Was 1,000,000 (librechat.yaml)", "Was hidden"). */
  const editedDescription = (): string => {
    const unsaved = localize('com_admin_config_ui_state_edited_desc');
    if (state.visibilityEdit === 'unhide') {
      return `${unsaved}. ${localize('com_admin_config_ui_state_edited_was_hidden')}`;
    }
    const was = savedValue();
    if (!fieldPath || !hasLayers || was?.value === undefined) return unsaved;
    const description = localize('com_admin_config_ui_state_edited_was', {
      value: formatConfigValue(was.value, localize, fieldPath),
      source: sourceLabel(was.source, localize, valuesScope),
    });
    return `${unsaved}. ${description}`;
  };

  const stateChip = (): ReactNode => {
    if (errorText) return <StateChip kind="error" />;
    if (isPending) {
      return (
        <StateChip
          kind="pendingRevert"
          description={
            revertLabels?.label ?? localize('com_admin_config_ui_state_pending_revert_desc')
          }
          onUndo={undo}
          undoLabel={undoLabel}
        />
      );
    }
    if (isEdited) {
      return (
        <>
          <StateChip
            kind="edited"
            description={editedDescription()}
            onUndo={undo}
            undoLabel={undoLabel}
          />
          {showsShadow(state) && <ShadowBadge shadowedBy={state.shadowedBy} />}
        </>
      );
    }
    if (fieldPath && hasLayers) return <FieldProvenance path={fieldPath} hideDefault />;
    return fallbackProvenanceChip();
  };

  const resetLabel = revertLabels?.label ?? localize('com_admin_ui_reset');
  const resetAriaLabel =
    revertLabels?.ariaLabel ??
    (isChanged
      ? localize('com_admin_a11y_remove_override', { name: title })
      : localize('com_admin_a11y_reset_to_default', { name: title }));

  const resetAction = canReset ? (
    <button
      type="button"
      className="settings-row-action"
      onClick={() => onResetField(fieldPath)}
      aria-label={resetAriaLabel}
    >
      {resetLabel}
    </button>
  ) : null;

  const cascade =
    overriddenBy && fieldPath ? (
      <ProfileIndicator fieldPath={fieldPath} fieldLabel={title} profiles={overriddenBy} />
    ) : null;

  const actions =
    resetAction || badge || cascade ? (
      <>
        {resetAction}
        {badge}
        {cascade}
      </>
    ) : undefined;

  const marker = (): t.SettingsRowMarker | undefined => {
    if (errorText) return 'error';
    if (isPending) return 'pending';
    if (isEdited) return 'edited';
    return undefined;
  };

  return (
    <SettingsRow
      label={title}
      htmlFor={fieldId}
      description={description}
      learnMoreUrl={learnMoreUrl}
      control={children}
      chips={stateChip()}
      hint={
        defaultHint != null ? (
          <span className="settings-hint">
            {localize('com_admin_config_ui_default_hint', { value: defaultHint })}
          </span>
        ) : undefined
      }
      actions={actions}
      error={errorText}
      required={required}
      width={
        controlWidth ??
        (fieldPath ? getFieldMeta(fieldPath)?.width : undefined) ??
        inferControlWidth(fieldPath, state.effective)
      }
      marker={marker()}
    />
  );
}
