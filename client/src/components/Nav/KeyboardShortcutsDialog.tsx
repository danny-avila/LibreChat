import { memo, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { X } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogClose } from '@librechat/client';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { shortcutDefinitions, isMac } from '~/hooks/useKeyboardShortcuts';
import type { ShortcutDefinition } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type GroupedShortcuts = Record<string, Array<ShortcutDefinition & { id: string }>>;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border-medium bg-surface-tertiary px-1.5 text-[11px] font-medium leading-none text-text-secondary shadow-[0_1px_0_0_rgba(0,0,0,0.08)] dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-text-secondary dark:shadow-none">
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
    <div className="flex items-center justify-between px-1 py-[7px]">
      <span className="text-[13px] text-text-primary">{label}</span>
      <KeyCombo keys={keys} />
    </div>
  );
}

function parseKeys(display: string): string[] {
  return display.split(/([+\s]+)/).filter((k) => k.trim().length > 0 && k !== '+');
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

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent
        showCloseButton={false}
        className="w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-0 shadow-lg dark:border-white/[0.06] dark:shadow-2xl sm:w-[460px]"
      >
        <div className="flex items-center justify-between px-5 pb-0 pt-5">
          <OGDialogTitle className="text-[15px] font-semibold text-text-primary">
            {localize('com_shortcut_keyboard_shortcuts')}
          </OGDialogTitle>
          <OGDialogClose className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary">
            <X className="h-4 w-4" />
            <span className="sr-only">{localize('com_ui_close')}</span>
          </OGDialogClose>
        </div>

        <div className="max-h-[min(60vh,480px)] overflow-y-auto px-4 pb-4 pt-2">
          {groupEntries.map(([groupKey, shortcuts], groupIdx) => (
            <div
              key={groupKey}
              className={cn(
                groupIdx > 0 &&
                  'border-border-light/60 mt-3 border-t pt-3 dark:border-white/[0.06]',
              )}
            >
              <h3 className="mb-0.5 px-1 text-[11px] font-medium uppercase tracking-widest text-text-tertiary">
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
          ))}
        </div>

        <div className="border-t border-border-light px-5 py-2.5 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-tertiary">
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
