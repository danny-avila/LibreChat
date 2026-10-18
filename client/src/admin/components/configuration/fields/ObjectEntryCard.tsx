import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { disabledInkClasses } from '@librechat/client';
import type * as t from '~/admin/types';
import { useLocalize, useValuesScope, useExpandableState } from '~/admin/hooks';
import { DecorativeIcon, StateChip } from '~/admin/components/shared';
import { BLOCK_UNSAFE_CONFIG_KEYS } from '~/admin/constants';
import { cn, isUnsafeConfigKey } from '~/admin/utils';
import { getEntrySummary } from './entries';
import { sourceLabel } from '../values';
import { CodeField } from './CodeField';

const ACTION_CLASSES = cn(
  'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent p-1.5 text-xs text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default) disabled:cursor-not-allowed disabled:opacity-50',
  disabledInkClasses,
);

function toDomId(value: string): string {
  return value.replace(/[^\w-]+/g, '-');
}

function asRecord(value: t.ConfigValue): t.ConfigRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * One collection entry (endpoint, MCP server, spec, list item). The header is
 * a single `<button aria-expanded>`; rename, add-field, reorder and delete are
 * always-visible sibling buttons. Deleting puts the entry into a pending
 * deletion state (rendered by the list) with Undo until Save. Field edits
 * merge into the latest entry value, so two changes in one tick both land.
 * Listens for `config:expand` / `config:collapse` on its root element.
 */
export function ObjectEntryCard({
  id,
  dataPath,
  entryKey,
  fields,
  value,
  onValueChange,
  onRemove,
  onRename,
  lockedNote,
  onUndoRemove,
  onMoveUp,
  onMoveDown,
  pendingRemoval,
  focusUndo,
  isNew,
  markers,
  summary,
  disabled,
  defaultExpanded = false,
  renderFields,
  editSessionId,
}: t.ObjectEntryCardProps) {
  const localize = useLocalize();
  const generatedId = useId();
  const [isExpanded, setIsExpanded] = useExpandableState(
    defaultExpanded,
    dataPath ? [dataPath] : undefined,
  );
  const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded);
  const [isEditing, setIsEditing] = useState(false);
  const [editKey, setEditKey] = useState(entryKey);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [hasAddField, setHasAddField] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const userToggledRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const addFieldTriggerRef = useRef<(() => void) | null>(null);
  const baseId = toDomId(id ?? dataPath ?? generatedId);
  const panelId = `${baseId}-panel`;
  const fieldsPath = dataPath ?? entryKey;

  useEffect(() => {
    if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);
  }, [isExpanded, hasEverExpanded]);

  useEffect(() => {
    if (defaultExpanded && !userToggledRef.current) setIsExpanded(true);
  }, [defaultExpanded, setIsExpanded]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const expand = () => setIsExpanded(true);
    const collapse = () => setIsExpanded(false);
    el.addEventListener('config:expand', expand);
    el.addEventListener('config:collapse', collapse);
    return () => {
      el.removeEventListener('config:expand', expand);
      el.removeEventListener('config:collapse', collapse);
    };
  }, [setIsExpanded]);

  /* The field list registers its add-field trigger in its own effect, which runs before this
     one in the same commit; re-reading it after every render keeps the button in step, and the
     setter bails out when nothing changed, so this never loops. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const has = addFieldTriggerRef.current != null;
    setHasAddField((prev) => (prev === has ? prev : has));
  });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (pendingRemoval && focusUndo) undoRef.current?.focus();
  }, [pendingRemoval, focusUndo]);

  useEffect(() => {
    if (!isNew || !cardRef.current) return;
    const card = cardRef.current;
    requestAnimationFrame(() => {
      card.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      card
        .querySelector<HTMLElement>(
          `#${CSS.escape(panelId)} :is(input:not([type="hidden"]), select, textarea, [role="switch"])`,
        )
        ?.focus({ preventScroll: true });
    });
  }, [isNew, panelId]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  }, [setIsExpanded]);

  const handleFieldChange = useCallback(
    (fieldPath: string, fieldValue: t.ConfigValue) => {
      const leafKey = fieldPath.split('.').pop() ?? fieldPath;
      const next = { ...asRecord(valueRef.current), [leafKey]: fieldValue };
      if (fieldValue === undefined) delete next[leafKey];
      valueRef.current = next;
      onValueChange(next);
    },
    [onValueChange],
  );

  const commitRename = useCallback(() => {
    const trimmed = editKey.trim();
    if (BLOCK_UNSAFE_CONFIG_KEYS && trimmed !== entryKey && isUnsafeConfigKey(trimmed)) {
      setRenameError(localize('com_admin_config_unsafe_key_error'));
      return;
    }
    setRenameError(null);
    setIsEditing(false);
    if (trimmed && trimmed !== entryKey && onRename) {
      onRename(trimmed);
    } else {
      setEditKey(entryKey);
    }
  }, [editKey, entryKey, onRename, localize]);

  const cancelRename = useCallback(() => {
    setEditKey(entryKey);
    setRenameError(null);
    setIsEditing(false);
  }, [entryKey]);

  const renameErrorId = `${baseId}-rename-error`;
  const summaryNode =
    summary !== undefined
      ? summary
      : getEntrySummary(value, entryKey, {
          enabled: localize('com_admin_ui_enabled'),
          disabled: localize('com_admin_ui_disabled'),
          type: (type) => {
            const key = `com_admin_config_enum_${type}`;
            const label = localize(key);
            return label === key ? type : label;
          },
        });

  if (pendingRemoval) {
    return (
      <div
        ref={cardRef}
        id={id}
        className="flex items-center gap-3 rounded-lg border border-dashed border-(--cui-color-stroke-default) px-3 py-2.5"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="truncate text-(--cui-color-text-muted) line-through" title={entryKey}>
            {entryKey}
          </span>
          <span className="shrink-0 text-xs text-(--cui-color-text-muted)">
            {localize('com_admin_config_ctl_entry_pending_delete')}
          </span>
        </span>
        {onUndoRemove && (
          <button
            ref={undoRef}
            type="button"
            onClick={onUndoRemove}
            aria-label={localize('com_admin_config_ctl_entry_undo_a11y', { name: entryKey })}
            className={cn(
              ACTION_CLASSES,
              'border border-solid border-(--cui-color-stroke-default)',
            )}
          >
            <DecorativeIcon name="history" size="sm" />
            <span>{localize('com_admin_config_ctl_entry_undo')}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      id={id}
      data-entry-card
      className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default)"
    >
      <div
        className={cn(
          '@container flex w-full items-center gap-1 pr-2',
          isExpanded && 'sticky top-0 z-5 rounded-t-lg bg-(--cui-color-background-default)',
        )}
      >
        {isEditing && onRename ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={editKey}
              onChange={(e) => {
                setEditKey(e.target.value);
                setRenameError(null);
              }}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === 'Escape') cancelRename();
              }}
              aria-label={localize('com_admin_a11y_rename_entry', { name: entryKey })}
              aria-invalid={renameError ? true : undefined}
              aria-describedby={renameError ? renameErrorId : undefined}
              className="config-input-ghost w-auto max-w-80 min-w-20 text-sm font-medium"
            />
            {renameError && (
              <span
                id={renameErrorId}
                role="alert"
                className="text-xs font-normal text-(--cui-color-text-danger)"
              >
                {renameError}
              </span>
            )}
          </span>
        ) : (
          <button
            type="button"
            data-section-id={id}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={toggle}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2.5 text-left transition-colors select-none hover:bg-(--cui-color-background-hover) focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-(--cui-color-outline)"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex shrink-0 items-center justify-center transition-transform duration-200',
                isExpanded && 'rotate-90',
              )}
            >
              <DecorativeIcon name="chevron-right" size="sm" />
            </span>
            <span
              className="max-w-[60%] min-w-16 shrink truncate text-sm font-medium text-(--cui-color-text-default)"
              title={entryKey}
            >
              {entryKey}
            </span>
            {isNew && (
              <span className="shrink-0 rounded-full bg-(--cui-color-background-muted) px-1.5 py-0.5 text-xs font-semibold text-(--cui-color-text-default) uppercase">
                {localize('com_admin_config_ctl_entry_new')}
              </span>
            )}
            {markers && <EntryMarkerChips markers={markers} />}
            {summaryNode && !isExpanded && (
              <span
                className="min-w-0 flex-1 truncate text-xs text-(--cui-color-text-muted)"
                title={typeof summaryNode === 'string' ? summaryNode : undefined}
              >
                {summaryNode}
              </span>
            )}
          </button>
        )}
        {!disabled && onRename && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={ACTION_CLASSES}
            aria-label={localize('com_admin_a11y_rename_entry', { name: entryKey })}
            title={localize('com_admin_a11y_rename_entry', { name: entryKey })}
          >
            <DecorativeIcon name="pencil" size="sm" />
          </button>
        )}
        {!disabled && hasAddField && (
          <button
            type="button"
            onClick={() => {
              userToggledRef.current = true;
              if (!isExpanded) setIsExpanded(true);
              requestAnimationFrame(() => addFieldTriggerRef.current?.());
            }}
            className={ACTION_CLASSES}
          >
            <DecorativeIcon name="plus" size="sm" />
            <span>{localize('com_admin_config_add_field')}</span>
          </button>
        )}
        {!disabled && onMoveUp && (
          <button
            type="button"
            onClick={onMoveUp}
            className={ACTION_CLASSES}
            aria-label={localize('com_admin_config_ctl_entry_move_up', { name: entryKey })}
            title={localize('com_admin_config_ctl_entry_move_up', { name: entryKey })}
          >
            <DecorativeIcon name="arrow-up" size="sm" />
          </button>
        )}
        {!disabled && onMoveDown && (
          <button
            type="button"
            onClick={onMoveDown}
            className={ACTION_CLASSES}
            aria-label={localize('com_admin_config_ctl_entry_move_down', { name: entryKey })}
            title={localize('com_admin_config_ctl_entry_move_down', { name: entryKey })}
          >
            <DecorativeIcon name="arrow-down" size="sm" />
          </button>
        )}
        {!disabled && lockedNote && (
          <span
            className={cn(ACTION_CLASSES, 'cursor-default hover:bg-transparent')}
            title={lockedNote}
          >
            <DecorativeIcon name="lock" size="sm" />
            <span className="sr-only">{lockedNote}</span>
          </span>
        )}
        {!disabled && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(ACTION_CLASSES, 'hover:text-(--cui-color-text-danger)')}
            aria-label={`${localize('com_admin_ui_delete')} ${entryKey}`}
            title={`${localize('com_admin_ui_delete')} ${entryKey}`}
          >
            <DecorativeIcon name="trash" size="sm" />
          </button>
        )}
      </div>
      <div
        id={panelId}
        className={cn(
          'config-section-grid',
          isExpanded ? 'config-section-grid-open' : 'config-section-grid-closed',
        )}
        {...(!isExpanded ? { inert: '' as const } : {})}
      >
        <div className="config-section-inner">
          <div className="flex flex-col gap-2 border-t border-(--cui-color-stroke-default) px-2 py-3">
            {hasEverExpanded && (
              <>
                {isPrimitive(value) && (
                  <PrimitiveEntry
                    value={value}
                    onChange={onValueChange}
                    fields={fields}
                    disabled={disabled}
                  />
                )}
                {!isPrimitive(value) &&
                  fields.length > 0 &&
                  renderFields(
                    fields,
                    value,
                    fieldsPath,
                    handleFieldChange,
                    addFieldTriggerRef,
                    editSessionId,
                    disabled,
                  )}
                {!isPrimitive(value) && fields.length === 0 && (
                  <CodeField
                    id={`${baseId}-code`}
                    value={value}
                    onChange={onValueChange}
                    disabled={disabled}
                    aria-label={entryKey}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The chip an entry header shows for the edit target's override: added here, or changing an entry from below. */
function useOverrideMarker(
  markers: t.EntryMarkers,
): { kind: t.StateChipKind; label: string; description: string } | null {
  const localize = useLocalize();
  const scope = useValuesScope();
  if (!markers.overridden) return null;
  if (scope) {
    return {
      kind: 'scope',
      label: sourceLabel('scope', localize, scope),
      description: localize(
        markers.added
          ? 'com_admin_config_ui_state_added_scope_desc'
          : 'com_admin_config_ui_state_scope_desc',
      ),
    };
  }
  return markers.added
    ? {
        kind: 'override',
        label: localize('com_admin_config_ui_state_added'),
        description: localize('com_admin_config_ui_state_added_desc'),
      }
    : {
        kind: 'override',
        label: sourceLabel('admin', localize),
        description: localize('com_admin_config_ui_state_override_desc'),
      };
}

/**
 * "Admin override" / "Added in admin panel" (or the profile's name) and
 * "Edited" in an entry header, like a settings row's chips. In a narrow card
 * (under 28rem) they collapse to dots, named by their tooltip and for screen
 * readers, so the title and the header actions keep their room.
 */
function EntryMarkerChips({ markers }: { markers: t.EntryMarkers }) {
  const localize = useLocalize();
  const override = useOverrideMarker(markers);
  if (!override && !markers.edited) return null;
  const edited = localize('com_admin_config_ui_state_edited');
  const editedDesc = localize('com_admin_config_ui_state_edited_desc');
  return (
    <>
      <span className="hidden shrink-0 items-center gap-1 @md:flex">
        {override && (
          <StateChip
            kind={override.kind}
            label={override.label}
            description={override.description}
          />
        )}
        {markers.edited && <StateChip kind="edited" description={editedDesc} />}
      </span>
      <span className="flex shrink-0 items-center gap-1 @md:hidden">
        {override && (
          <span
            className="entry-marker-dot entry-marker-dot-override"
            title={`${override.label}: ${override.description}`}
          >
            <span className="sr-only">{`${override.label}, ${override.description}`}</span>
          </span>
        )}
        {markers.edited && (
          <span
            className="entry-marker-dot entry-marker-dot-edited"
            title={`${edited}: ${editedDesc}`}
          >
            <span className="sr-only">{`${edited}, ${editedDesc}`}</span>
          </span>
        )}
      </span>
    </>
  );
}

function isPrimitive(value: t.ConfigValue): boolean {
  return value === null || value === undefined || typeof value !== 'object';
}

function PrimitiveEntry({
  value,
  onChange,
  fields,
  disabled,
}: {
  value: t.ConfigValue;
  onChange: (v: t.ConfigValue) => void;
  fields: t.SchemaField[];
  disabled?: boolean;
}) {
  const localize = useLocalize();
  return (
    <div className="flex items-center gap-3 px-2.5">
      <span className="text-sm text-(--cui-color-text-muted)">
        {typeof value === 'boolean'
          ? localize(value ? 'com_admin_ui_enabled' : 'com_admin_ui_disabled')
          : String(value ?? '')}
      </span>
      {fields.length > 0 && !disabled && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="cursor-pointer border-none bg-transparent p-0 text-xs text-(--cui-color-text-link) hover:underline"
        >
          {localize('com_admin_config_customize')}
        </button>
      )}
    </div>
  );
}
