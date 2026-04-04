import { memo, useMemo } from 'react';
import { X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogClose } from '@librechat/client';
import type { ShortcutDefinition } from '~/hooks/useKeyboardShortcuts';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { shortcutDefinitions, isMac } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type GroupedShortcuts = Record<string, Array<ShortcutDefinition & { id: string }>>;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border-light bg-surface-secondary px-1.5 text-[11px] font-medium leading-none text-text-secondary shadow-[0_1px_0_0_rgba(0,0,0,0.08)] dark:shadow-none">
      {children}
    </kbd>
  );
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, idx) => (
        <Kbd key={`${key}-${idx}`}>{key}</Kbd>
      ))}
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[5px]">
      <span className="truncate text-[13px] text-text-primary">{label}</span>
      <KeyCombo keys={keys} />
    </div>
  );
}

function parseKeys(display: string): string[] {
  return display.split(/([+\s]+)/).filter((k) => k.trim().length > 0 && k !== '+');
}

function ShortcutGroup({
  groupKey,
  shortcuts,
  isFirst,
}: {
  groupKey: string;
  shortcuts: Array<ShortcutDefinition & { id: string }>;
  isFirst: boolean;
}) {
  const localize = useLocalize();
  return (
    <div className={cn(!isFirst && 'mt-2 border-t border-border-light pt-2')}>
      <h3 className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-text-secondary">
        {localize(groupKey as TranslationKeys)}
      </h3>
      {shortcuts.map((shortcut) => (
        <ShortcutRow
          key={shortcut.id}
          label={localize(shortcut.labelKey as TranslationKeys)}
          keys={parseKeys(isMac ? shortcut.displayMac : shortcut.displayOther)}
        />
      ))}
    </div>
  );
}

function KeyboardShortcutsDialog() {
  const localize = useLocalize();
  const [open, setOpen] = useRecoilState(store.showShortcutsDialog);

  const grouped = useMemo<GroupedShortcuts>(() => {
    const groups: GroupedShortcuts = {};
    for (const [id, def] of Object.entries(shortcutDefinitions)) {
      const group = def.groupKey;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push({ ...def, id });
    }
    return groups;
  }, []);

  const groupEntries = useMemo(() => Object.entries(grouped), [grouped]);

  const leftColumn = useMemo(
    () => groupEntries.filter(([key]) => key !== 'com_shortcut_group_chat'),
    [groupEntries],
  );
  const rightColumn = useMemo(
    () => groupEntries.filter(([key]) => key === 'com_shortcut_group_chat'),
    [groupEntries],
  );

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent
        showCloseButton={false}
        className="w-11/12 max-w-4xl overflow-hidden px-6 py-1"
      >
        <div className="flex items-center justify-between pb-0 pt-5">
          <OGDialogTitle>{localize('com_shortcut_keyboard_shortcuts')}</OGDialogTitle>
          <OGDialogClose>
            <X className="h-4 w-4" />
            <span className="sr-only">{localize('com_ui_close')}</span>
          </OGDialogClose>
        </div>

        <div className="grid grid-cols-2 gap-x-6 overflow-y-auto pb-4 pt-2">
          <div>
            {leftColumn.map(([groupKey, shortcuts], idx) => (
              <ShortcutGroup
                key={groupKey}
                groupKey={groupKey}
                shortcuts={shortcuts}
                isFirst={idx === 0}
              />
            ))}
          </div>
          <div>
            {rightColumn.map(([groupKey, shortcuts], idx) => (
              <ShortcutGroup
                key={groupKey}
                groupKey={groupKey}
                shortcuts={shortcuts}
                isFirst={idx === 0}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-border-light py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {localize('com_shortcut_show_shortcuts')}
            </span>
            <KeyCombo keys={[isMac ? '⌘' : 'Ctrl', '⇧', '/']} />
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default memo(KeyboardShortcutsDialog);
