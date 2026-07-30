import { useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Zap, ZapOff, Clock, MoreHorizontal } from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { isMacPlatform, resolveComposerKeyDown, bindingDisplayString } from '~/utils/shortcuts';
import useComposerBindings from '~/hooks/Input/useComposerBindings';
import { useLocalize } from '~/hooks';
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
            disabled={entry.disabled === true}
            accessibleWhenDisabled
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
      onClick: () => setInterrupts(!interrupts),
    }),
    [interrupts, setInterrupts, localize],
  );
}

/**
 * The interrupt chord for tooltips, present only while the chord still
 * preempts: a chord rebound to a global shortcut (or claimed by a rebound
 * submit) must not be advertised, and `resolveComposerKeyDown` is the one
 * source of that answer.
 */
export function useInterruptChordHint(): string | undefined {
  const enterToSend = useRecoilValue(store.enterToSend);
  const { submitOverride, yieldedChords } = useComposerBindings();
  return useMemo(() => {
    const chord = {
      meta: isMacPlatform,
      ctrl: !isMacPlatform,
      alt: false,
      shift: true,
      key: 'Enter',
    };
    const verdict = resolveComposerKeyDown(
      { key: 'Enter', altKey: false, ctrlKey: chord.ctrl, metaKey: chord.meta, shiftKey: true },
      {
        isComposing: false,
        isSubmitting: true,
        allowSubmitWhileGenerating: true,
        hasDuringRunModifier: true,
        enterToSend,
        submitOverride,
        yieldedChords,
      },
    );
    return verdict === 'preempt'
      ? (bindingDisplayString(chord, isMacPlatform) ?? undefined)
      : undefined;
  }, [enterToSend, submitOverride, yieldedChords]);
}
