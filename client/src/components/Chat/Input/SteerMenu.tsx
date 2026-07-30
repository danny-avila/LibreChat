import { useMemo } from 'react';
import { useRecoilState } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { InfoHoverCard, ESide } from '@librechat/client';
import { Zap, ZapOff, Clock, ArrowUp, MoreHorizontal } from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { useShortcutDisplay } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

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
  disabled?: boolean;
  /** Localized description shown as the standard info hovercard. */
  info?: string;
};

/**
 * Per-row "…" overflow menu: message actions first, then a visually separated
 * "Preferences" section for the sticky mode toggles, so one-off actions and
 * persistent behavior changes never read as the same kind of choice.
 */
export function RowMenu({
  label,
  entries,
  preferences,
}: {
  label: string;
  entries: MenuEntry[];
  preferences?: MenuEntry[];
}) {
  const localize = useLocalize();
  const menu = Ariakit.useMenuStore({ placement: 'top-end' });
  const renderEntry = (entry: MenuEntry) => (
    <Ariakit.MenuItem
      key={entry.key}
      className={MENU_ITEM_CLASS}
      disabled={entry.disabled === true}
      accessibleWhenDisabled
      onClick={() => {
        entry.onClick();
        menu.hide();
      }}
    >
      {entry.icon}
      {entry.label}
      {entry.info != null && (
        <span className="ml-auto flex items-center" onClick={(event) => event.stopPropagation()}>
          <InfoHoverCard side={ESide.Top} text={entry.info} />
        </span>
      )}
    </Ariakit.MenuItem>
  );
  return (
    <>
      <Ariakit.MenuButton store={menu} aria-label={label} className={ICON_BTN_CLASS}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Ariakit.MenuButton>
      <Ariakit.Menu store={menu} portal gutter={6} className={MENU_CLASS}>
        {entries.map(renderEntry)}
        {preferences != null && preferences.length > 0 && (
          <>
            <div role="separator" className="mx-2 my-1 border-t border-border-light" />
            <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {localize('com_ui_preferences')}
            </div>
            {preferences.map(renderEntry)}
          </>
        )}
      </Ariakit.Menu>
    </>
  );
}

/**
 * The always-visible escalation control on a waiting message: interrupt &
 * steer it now, at the next safe token boundary. The tooltip teaches this
 * action's OWN shortcut (registry-aware, so a rebinding shows correctly);
 * the shortcut handler clicks whichever of these buttons is newest, so the
 * two can never diverge.
 */
export function EscalateNowButton({
  surface,
  disabled,
  onClick,
}: {
  surface: 'bubble' | 'queued';
  disabled: boolean;
  onClick: () => void;
}) {
  const localize = useLocalize();
  const chord = useShortcutDisplay('escalateSteer');
  const label = localize('com_ui_interrupt_steer_now');
  return (
    <Ariakit.TooltipProvider placement="top" timeout={300}>
      <Ariakit.TooltipAnchor
        render={
          <button
            type="button"
            aria-label={label}
            data-escalate-steer={surface}
            data-testid={surface === 'queued' ? 'queued-interrupt-now' : 'steer-escalate-now'}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border border-border-medium',
              'text-text-primary transition-colors hover:bg-surface-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      />
      <Ariakit.Tooltip className="z-50 rounded-lg bg-surface-tertiary px-2 py-1 text-xs text-text-primary shadow-lg">
        {chord ? `${label} · ${chord}` : label}
      </Ariakit.Tooltip>
    </Ariakit.TooltipProvider>
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
      info: localize('com_nav_info_during_run_action'),
      onClick: () => steering.setDefaultAction(next),
    };
  }, [steering, localize]);
}

/**
 * The overflow item that flips whether a default steer interrupts generation
 * (`steerInterruptsByDefault`). Worded as the mode you would switch to, like
 * the queue/steer toggle above.
 */
export function useInterruptToggleEntry(): MenuEntry {
  const localize = useLocalize();
  const [interrupts, setInterrupts] = useRecoilState(store.steerInterruptsByDefault);
  return useMemo(
    () => ({
      key: 'toggle-interrupt',
      label: interrupts
        ? localize('com_ui_wait_for_tool_steps')
        : localize('com_ui_always_interrupt'),
      icon: interrupts ? (
        <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
      ) : (
        <ZapOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
      ),
      info: localize('com_ui_steer_interrupts_default_info'),
      onClick: () => setInterrupts(!interrupts),
    }),
    [interrupts, setInterrupts, localize],
  );
}
