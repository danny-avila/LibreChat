import { memo, useCallback, useMemo, useState } from 'react';
import { useRecoilState } from 'recoil';
import { Pencil, RotateCcw, X } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogClose } from '@librechat/client';
import type { ShortcutActionId, ShortcutBindingInfo } from '~/hooks/useKeyboardShortcuts';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { ShortcutBinding } from '~/utils/shortcuts';
import { isMac, useShortcutBindings, useShortcutDisplay } from '~/hooks/useKeyboardShortcuts';
import { RecorderInfo, RecorderPill, useShortcutRecorder } from './ShortcutRecorder';
import { bindingDisplayKeys } from '~/utils/shortcuts';
import ShortcutKeyCombo from './ShortcutKeyCombo';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type GroupedBindings = Record<string, ShortcutBindingInfo[]>;

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
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13.5px] font-medium text-text-primary">{label}</span>
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
  onStartEdit,
  onStopEdit,
  bindingMap,
  getActionLabel,
  setBinding,
  resetBinding,
}: {
  info: ShortcutBindingInfo;
  isEditing: boolean;
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

  return (
    <div
      className={cn(
        'group relative rounded-xl px-3 py-2.5 transition-all duration-200',
        isEditing
          ? 'bg-surface-tertiary/60 dark:bg-surface-secondary-alt/60 ring-1 ring-blue-500/30'
          : 'hover:bg-surface-tertiary/50 dark:hover:bg-surface-secondary-alt/40',
      )}
    >
      {isEditing ? (
        <EditingRow
          info={info}
          label={label}
          bindingMap={bindingMap}
          getActionLabel={getActionLabel}
          setBinding={setBinding}
          onStopEdit={onStopEdit}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-text-primary">{label}</span>
            {info.isCustom && (
              <span
                className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 ring-2 ring-blue-500/20"
                aria-hidden="true"
                title={localize('com_shortcut_edit_aria', { 0: label })}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {displayKeys.length > 0 ? (
              <ShortcutKeyCombo keys={displayKeys} />
            ) : (
              <span className="text-[12px] font-medium italic text-text-secondary">
                {localize('com_shortcut_not_set')}
              </span>
            )}
            <div className="ml-1 flex items-center gap-0.5 opacity-0 transition-all duration-200 focus-within:opacity-100 group-hover:opacity-100">
              {info.isCustom && (
                <button
                  type="button"
                  onClick={() => resetBinding(info.id)}
                  aria-label={localize('com_shortcut_reset_aria', { 0: label })}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onStartEdit(info.id)}
                aria-label={localize('com_shortcut_edit_aria', { 0: label })}
                data-testid={`edit-shortcut-${info.id}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-active-alt hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutGroup({
  groupKey,
  bindings,
  editingId,
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
  onStartEdit: (id: ShortcutActionId) => void;
  onStopEdit: () => void;
  bindingMap: Map<string, ShortcutActionId>;
  getActionLabel: (id: string) => string;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  resetBinding: (id: ShortcutActionId) => void;
}) {
  const localize = useLocalize();
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
        {localize(groupKey as TranslationKeys)}
      </h3>
      <div className="flex flex-col gap-0.5">
        {bindings.map((info) => (
          <ShortcutRow
            key={info.id}
            info={info}
            isEditing={editingId === info.id}
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
  const showShortcutsDisplay = useShortcutDisplay('showShortcuts');
  const [open, setOpen] = useRecoilState(store.showShortcutsDialog);
  const [editingId, setEditingId] = useState<ShortcutActionId | null>(null);

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
    () => groupEntries.filter(([key]) => key !== 'com_shortcut_group_chat'),
    [groupEntries],
  );
  const rightColumn = useMemo(
    () => groupEntries.filter(([key]) => key === 'com_shortcut_group_chat'),
    [groupEntries],
  );

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
        className="flex max-h-[85vh] w-11/12 max-w-4xl flex-col overflow-hidden p-0"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-7 pb-4 pt-6">
          <div className="flex flex-col gap-1">
            <OGDialogTitle className="text-[18px] font-semibold tracking-tight text-text-primary">
              {localize('com_shortcut_keyboard_shortcuts')}
            </OGDialogTitle>
            <p className="text-[13px] text-text-secondary">
              {localize('com_shortcut_dialog_subtitle')}
            </p>
          </div>
          <OGDialogClose className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">{localize('com_ui_close')}</span>
          </OGDialogClose>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-x-8 overflow-y-auto px-4 pb-2 md:grid-cols-2">
          <div>
            {leftColumn.map(([groupKey, items]) => (
              <ShortcutGroup
                key={groupKey}
                groupKey={groupKey}
                bindings={items}
                editingId={editingId}
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
                onStartEdit={handleStartEdit}
                onStopEdit={handleStopEdit}
                bindingMap={bindingMap}
                getActionLabel={getActionLabel}
                setBinding={setBinding}
                resetBinding={resetBinding}
              />
            ))}
          </div>
        </div>

        <footer className="bg-surface-primary-alt/50 flex shrink-0 items-center justify-between border-t border-border-light px-7 py-3.5">
          <button
            type="button"
            disabled={!hasAnyCustom}
            onClick={resetAll}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-all',
              hasAnyCustom
                ? 'text-text-secondary hover:bg-surface-active-alt hover:text-text-primary'
                : 'cursor-not-allowed text-text-secondary opacity-40',
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {localize('com_shortcut_reset_all')}
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] font-medium text-text-secondary">
              {localize('com_shortcut_show_shortcuts')}
            </span>
            <ShortcutKeyCombo display={showShortcutsDisplay} />
          </div>
        </footer>
      </OGDialogContent>
    </OGDialog>
  );
}

export default memo(KeyboardShortcutsDialog);
