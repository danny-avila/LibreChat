import { useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { Zap, Clock, MoreHorizontal } from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { useLocalize } from '~/hooks';

/** Shared row/bubble affordances for the during-run surfaces: the in-flight
 *  steer bubbles (`InFlightSteers`) and the queued/failed rows
 *  (`PendingSteerChips`) offer the same actions, so they share one menu. */
export const ICON_BTN_CLASS =
  'shrink-0 rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
export const PRIMARY_BTN_CLASS =
  'flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
const MENU_CLASS =
  'z-50 min-w-[13rem] rounded-xl border border-border-light bg-surface-secondary p-1.5 text-text-primary shadow-lg outline-none';
const MENU_ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary data-[active-item]:bg-surface-tertiary aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

export type MenuEntry = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

/** Per-row "…" overflow menu (edit / mode toggle / conversions). */
export function RowMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const menu = Ariakit.useMenuStore({ placement: 'top-end' });
  return (
    <>
      <Ariakit.MenuButton store={menu} aria-label={label} className={ICON_BTN_CLASS}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Ariakit.MenuButton>
      <Ariakit.Menu store={menu} portal gutter={6} className={MENU_CLASS}>
        {entries.map((entry) => (
          <Ariakit.MenuItem
            key={entry.key}
            className={MENU_ITEM_CLASS}
            onClick={() => {
              entry.onClick();
              menu.hide();
            }}
          >
            {entry.icon}
            {entry.label}
          </Ariakit.MenuItem>
        ))}
      </Ariakit.Menu>
    </>
  );
}

/**
 * The overflow item that flips the Enter-during-run default. Shown as the
 * OPPOSITE of the current default (the action you would switch to), matching
 * the reference UX ("Turn on queueing" while steer is the default).
 */
export function useDefaultToggleEntry(steering: SteeringControls): MenuEntry {
  const localize = useLocalize();
  return useMemo(() => {
    const next = steering.defaultAction === 'steer' ? 'queue' : 'steer';
    return {
      key: 'toggle-default',
      label:
        next === 'queue'
          ? localize('com_ui_turn_on_queueing')
          : localize('com_ui_turn_on_steering'),
      icon:
        next === 'queue' ? (
          <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />
        ) : (
          <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
        ),
      onClick: () => steering.setDefaultAction(next),
    };
  }, [steering, localize]);
}
