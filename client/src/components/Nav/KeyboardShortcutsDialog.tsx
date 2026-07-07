import { memo, useCallback, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogClose } from '@librechat/client';
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
        <span className="truncate text-[13px] text-text-primary">{label}</span>
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
  const editAriaLabel = localize('com_shortcut_edit_aria', { 0: label });
  const isUnset = displayKeys.length === 0;

  if (isEditing) {
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
    <div className="group flex items-center justify-between gap-3 px-2 py-2">
      <span
        className={cn(
          'truncate text-[13px]',
          isUnset ? 'text-text-secondary' : 'text-text-primary',
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        {info.isCustom && (
          <button
            type="button"
            onClick={() => resetBinding(info.id)}
            className="text-[11.5px] text-text-secondary opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          >
            {localize('com_shortcut_reset')}
          </button>
        )}
        {isUnset ? (
          <button
            type="button"
            onClick={() => onStartEdit(info.id)}
            aria-label={editAriaLabel}
            data-testid={`edit-shortcut-${info.id}`}
            className="inline-flex h-[22px] items-center gap-1 rounded-md border border-dashed border-border-medium bg-transparent px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-surface-secondary-alt"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {localize('com_shortcut_set')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(info.id)}
            aria-label={editAriaLabel}
            data-testid={`edit-shortcut-${info.id}`}
            className="rounded-md px-1 py-0.5 transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-surface-secondary-alt"
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
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 px-2 text-[12px] font-medium text-text-secondary">
        {localize(groupKey as TranslationKeys)}
      </h3>
      <div className="flex flex-col">
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

function PanelsSection({
  bindings,
  editingId,
  onStartEdit,
  onStopEdit,
  bindingMap,
  getActionLabel,
  setBinding,
  resetBinding,
}: {
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
    <section className="border-t border-border-light px-5 pb-2 pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-2">
        <h3 className="text-[12px] font-medium text-text-secondary">
          {localize('com_shortcut_group_panels')}
        </h3>
        <p className="text-text-secondary/80 text-[11.5px]">
          {localize('com_shortcut_group_panels_hint')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
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
        className="flex max-h-[85vh] w-11/12 max-w-3xl flex-col overflow-hidden p-0"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-7 pt-6">
          <OGDialogTitle className="text-[16px] font-semibold text-text-primary">
            {localize('com_shortcut_keyboard_shortcuts')}
          </OGDialogTitle>
          <OGDialogClose className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-surface-secondary-alt">
            <X className="h-4 w-4" />
            <span className="sr-only">{localize('com_ui_close')}</span>
          </OGDialogClose>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-x-10 px-5 pb-2 pt-5 md:grid-cols-2">
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
          {panelEntries.length > 0 && (
            <PanelsSection
              bindings={panelEntries}
              editingId={editingId}
              onStartEdit={handleStartEdit}
              onStopEdit={handleStopEdit}
              bindingMap={bindingMap}
              getActionLabel={getActionLabel}
              setBinding={setBinding}
              resetBinding={resetBinding}
            />
          )}
        </div>

        {hasAnyCustom && (
          <footer className="flex shrink-0 justify-end border-t border-border-light px-7 py-3">
            <button
              type="button"
              onClick={resetAll}
              className="text-[12px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
