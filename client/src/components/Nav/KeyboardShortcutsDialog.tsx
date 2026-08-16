import { memo, useCallback, useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import {
  Label,
  Switch,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogContent,
} from '@librechat/client';
import type { ShortcutActionId, ShortcutBindingInfo } from '~/hooks/useKeyboardShortcuts';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { ShortcutBinding } from '~/utils/shortcuts';
import { RecorderInfo, RecorderPill, useShortcutRecorder } from './ShortcutRecorder';
import { isMac, useShortcutBindings } from '~/hooks/useKeyboardShortcuts';
import { bindingDisplayKeys } from '~/utils/shortcuts';
import ShortcutKeyCombo from './ShortcutKeyCombo';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type GroupedBindings = Record<string, ShortcutBindingInfo[]>;

const PANELS_GROUP = 'com_shortcut_group_panels';

function EditingRow({
  info,
  label,
  bindingMap,
  getActionLabel,
  setBinding,
  onStopEdit,
}: {
  info: ShortcutBindingInfo;
  label: string;
  bindingMap: Map<string, ShortcutActionId>;
  getActionLabel: (id: string) => string;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  onStopEdit: () => void;
}) {
  const localize = useLocalize();

  const handleSave = useCallback(
    (binding: ShortcutBinding) => {
      setBinding(info.id, binding);
      onStopEdit();
    },
    [info.id, setBinding, onStopEdit],
  );

  const handleSaveReplacing = useCallback(
    (binding: ShortcutBinding, conflictId: string) => {
      setBinding(conflictId as ShortcutActionId, null);
      setBinding(info.id, binding);
      onStopEdit();
    },
    [info.id, setBinding, onStopEdit],
  );

  const recorder = useShortcutRecorder({
    initial: info.binding,
    bindingMap: bindingMap as Map<string, string>,
    ownerId: info.id,
    getActionLabel,
    onSave: handleSave,
    onCancel: onStopEdit,
  });

  return (
    <div ref={recorder.boundaryRef} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[0.8125rem] text-text-primary">{label}</span>
        <RecorderPill
          state={recorder}
          ariaLabel={localize('com_shortcut_edit_aria', { 0: label })}
          ownerId={info.id}
        />
      </div>
      <RecorderInfo
        state={recorder}
        ownerId={info.id}
        onCancel={onStopEdit}
        onSaveReplacing={handleSaveReplacing}
      />
    </div>
  );
}

function ShortcutRow({
  info,
  isEditing,
  disabled,
  onStartEdit,
  onStopEdit,
  bindingMap,
  getActionLabel,
  setBinding,
  resetBinding,
}: {
  info: ShortcutBindingInfo;
  isEditing: boolean;
  disabled: boolean;
  onStartEdit: (id: ShortcutActionId) => void;
  onStopEdit: () => void;
  bindingMap: Map<string, ShortcutActionId>;
  getActionLabel: (id: string) => string;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  resetBinding: (id: ShortcutActionId) => void;
}) {
  const localize = useLocalize();
  const label = localize(info.labelKey as TranslationKeys);
  const displayKeys = useMemo(() => bindingDisplayKeys(info.binding, isMac), [info.binding]);
  const editAriaLabel = localize('com_shortcut_edit_aria', { 0: label });
  const isUnset = displayKeys.length === 0;

  if (isEditing && !disabled) {
    return (
      <div className="px-2 py-2">
        <EditingRow
          info={info}
          label={label}
          bindingMap={bindingMap}
          getActionLabel={getActionLabel}
          setBinding={setBinding}
          onStopEdit={onStopEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-3 px-2 py-2',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'truncate text-[0.8125rem]',
          isUnset || disabled ? 'text-text-secondary' : 'text-text-primary',
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        {info.isCustom && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => resetBinding(info.id)}
            className="text-[0.71875rem] text-text-secondary opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary group-hover:opacity-100"
          >
            {localize('com_shortcut_reset')}
          </button>
        )}
        {isUnset ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onStartEdit(info.id)}
            aria-label={editAriaLabel}
            data-testid={`edit-shortcut-${info.id}`}
            className="inline-flex h-[1.375rem] items-center gap-1 rounded-md border border-dashed border-border-medium bg-transparent px-2 text-[0.6875rem] font-medium text-text-secondary transition-colors hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary dark:hover:bg-surface-secondary-alt"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {localize('com_shortcut_set')}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onStartEdit(info.id)}
            aria-label={editAriaLabel}
            data-testid={`edit-shortcut-${info.id}`}
            className="rounded-md px-1 py-0.5 transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary dark:hover:bg-surface-secondary-alt"
          >
            <ShortcutKeyCombo keys={displayKeys} />
          </button>
        )}
      </div>
    </div>
  );
}

function ShortcutGroup({
  groupKey,
  bindings,
  editingId,
  disabled,
  onStartEdit,
  onStopEdit,
  bindingMap,
  getActionLabel,
  setBinding,
  resetBinding,
}: {
  groupKey: string;
  bindings: ShortcutBindingInfo[];
  editingId: ShortcutActionId | null;
  disabled: boolean;
  onStartEdit: (id: ShortcutActionId) => void;
  onStopEdit: () => void;
  bindingMap: Map<string, ShortcutActionId>;
  getActionLabel: (id: string) => string;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  resetBinding: (id: ShortcutActionId) => void;
}) {
  const localize = useLocalize();
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 px-2 text-[0.75rem] font-medium text-text-secondary">
        {localize(groupKey as TranslationKeys)}
      </h3>
      <div className="flex flex-col">
        {bindings.map((info) => (
          <ShortcutRow
            key={info.id}
            info={info}
            isEditing={editingId === info.id}
            disabled={disabled}
            onStartEdit={onStartEdit}
            onStopEdit={onStopEdit}
            bindingMap={bindingMap}
            getActionLabel={getActionLabel}
            setBinding={setBinding}
            resetBinding={resetBinding}
          />
        ))}
      </div>
    </section>
  );
}

function PanelsSection({
  bindings,
  editingId,
  disabled,
  onStartEdit,
  onStopEdit,
  bindingMap,
  getActionLabel,
  setBinding,
  resetBinding,
}: {
  bindings: ShortcutBindingInfo[];
  editingId: ShortcutActionId | null;
  disabled: boolean;
  onStartEdit: (id: ShortcutActionId) => void;
  onStopEdit: () => void;
  bindingMap: Map<string, ShortcutActionId>;
  getActionLabel: (id: string) => string;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  resetBinding: (id: ShortcutActionId) => void;
}) {
  const localize = useLocalize();
  return (
    <section className="mb-6 border-t border-border-light pt-4 last:mb-0 md:col-span-2 lg:col-span-1 lg:border-t-0 lg:pt-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-2">
        <h3 className="text-[0.75rem] font-medium text-text-secondary">
          {localize('com_shortcut_group_panels')}
        </h3>
        <p className="text-[0.71875rem] text-text-secondary/80">
          {localize('com_shortcut_group_panels_hint')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2 lg:grid-cols-1">
        {bindings.map((info) => (
          <ShortcutRow
            key={info.id}
            info={info}
            isEditing={editingId === info.id}
            disabled={disabled}
            onStartEdit={onStartEdit}
            onStopEdit={onStopEdit}
            bindingMap={bindingMap}
            getActionLabel={getActionLabel}
            setBinding={setBinding}
            resetBinding={resetBinding}
          />
        ))}
      </div>
    </section>
  );
}

function KeyboardShortcutsDialog() {
  const localize = useLocalize();
  const { bindings, bindingMap, setBinding, resetBinding, resetAll } = useShortcutBindings();
  const [open, setOpen] = useRecoilState(store.showShortcutsDialog);
  const [enabled, setEnabled] = useRecoilState(store.shortcutsEnabled);
  const [editingId, setEditingId] = useState<ShortcutActionId | null>(null);
  const enableSwitchId = useId();

  const grouped = useMemo<GroupedBindings>(() => {
    const groups: GroupedBindings = {};
    for (const info of bindings) {
      const group = info.groupKey;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(info);
    }
    return groups;
  }, [bindings]);

  const groupEntries = useMemo(() => Object.entries(grouped), [grouped]);

  const leftColumn = useMemo(
    () => groupEntries.filter(([key]) => key !== 'com_shortcut_group_chat' && key !== PANELS_GROUP),
    [groupEntries],
  );
  const rightColumn = useMemo(
    () => groupEntries.filter(([key]) => key === 'com_shortcut_group_chat'),
    [groupEntries],
  );
  const panelEntries = useMemo(() => grouped[PANELS_GROUP] ?? [], [grouped]);

  const labelMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const info of bindings) {
      map.set(info.id, localize(info.labelKey as TranslationKeys));
    }
    return map;
  }, [bindings, localize]);

  const getActionLabel = useCallback((id: string) => labelMap.get(id) ?? id, [labelMap]);

  const handleStartEdit = useCallback((id: ShortcutActionId) => {
    setEditingId(id);
  }, []);
  const handleStopEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const hasAnyCustom = useMemo(() => bindings.some((b) => b.isCustom), [bindings]);

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEditingId(null);
        }
        setOpen(next);
      }}
    >
      <OGDialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-11/12 max-w-3xl flex-col overflow-hidden p-0 lg:max-w-5xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-7 pt-6">
          <OGDialogTitle className="text-[1rem] font-semibold text-text-primary">
            {localize('com_shortcut_keyboard_shortcuts')}
          </OGDialogTitle>
          <OGDialogClose className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary dark:hover:bg-surface-secondary-alt">
            <X className="h-4 w-4" />
            <span className="sr-only">{localize('com_ui_close')}</span>
          </OGDialogClose>
        </header>

        <div className="mt-4 flex items-center justify-between gap-4 border-b border-border-light px-7 pb-3">
          <div className="min-w-0">
            <Label
              htmlFor={enableSwitchId}
              className="cursor-pointer select-none text-[0.8125rem] font-medium text-text-primary"
            >
              {localize('com_shortcut_keyboard_shortcuts')}
            </Label>
            <p className="mt-0.5 text-[0.71875rem] text-text-secondary">
              {localize('com_shortcut_enable_all_hint')}
            </p>
          </div>
          <Switch
            id={enableSwitchId}
            checked={enabled}
            onCheckedChange={(value) => {
              const next = value !== false;
              if (!next) {
                setEditingId(null);
              }
              setEnabled(next);
            }}
            aria-label={localize('com_shortcut_keyboard_shortcuts')}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-x-10 px-5 pb-2 pt-5 md:grid-cols-2 lg:grid-cols-3">
            <div>
              {leftColumn.map(([groupKey, items]) => (
                <ShortcutGroup
                  key={groupKey}
                  groupKey={groupKey}
                  bindings={items}
                  editingId={editingId}
                  disabled={!enabled}
                  onStartEdit={handleStartEdit}
                  onStopEdit={handleStopEdit}
                  bindingMap={bindingMap}
                  getActionLabel={getActionLabel}
                  setBinding={setBinding}
                  resetBinding={resetBinding}
                />
              ))}
            </div>
            <div>
              {rightColumn.map(([groupKey, items]) => (
                <ShortcutGroup
                  key={groupKey}
                  groupKey={groupKey}
                  bindings={items}
                  editingId={editingId}
                  disabled={!enabled}
                  onStartEdit={handleStartEdit}
                  onStopEdit={handleStopEdit}
                  bindingMap={bindingMap}
                  getActionLabel={getActionLabel}
                  setBinding={setBinding}
                  resetBinding={resetBinding}
                />
              ))}
            </div>
            {panelEntries.length > 0 && (
              <PanelsSection
                bindings={panelEntries}
                editingId={editingId}
                disabled={!enabled}
                onStartEdit={handleStartEdit}
                onStopEdit={handleStopEdit}
                bindingMap={bindingMap}
                getActionLabel={getActionLabel}
                setBinding={setBinding}
                resetBinding={resetBinding}
              />
            )}
          </div>
        </div>

        {hasAnyCustom && (
          <footer className="flex shrink-0 justify-end border-t border-border-light px-7 py-3">
            <button
              type="button"
              onClick={resetAll}
              className="text-[0.75rem] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
            >
              {localize('com_shortcut_reset_all')}
            </button>
          </footer>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}

export default memo(KeyboardShortcutsDialog);
