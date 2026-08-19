import React, { forwardRef, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { useWatch } from 'react-hook-form';
import { SendIcon } from '@librechat/client';
import { Zap, Clock, OctagonPause, ZapOff } from 'lucide-react';
import type { Control } from 'react-hook-form';
import type { ComposerKeyContext, KeyChordSource } from '~/utils/shortcuts';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { isMacPlatform, resolveComposerKeyDown } from '~/utils/shortcuts';
import useComposerBindings from '~/hooks/Input/useComposerBindings';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-text-primary hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded-md bg-surface-tertiary px-1.5 py-0.5 font-sans text-xs text-text-secondary">
      {children}
    </kbd>
  );
}

type ActionRow = {
  key: string;
  label: string;
  kbd?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

type DuringRunSendButtonProps = {
  control: Control<{ text: string }>;
  steering: SteeringControls;
  getText: () => string;
  onConsumed: () => void;
  /** External hold (e.g. uploads in flight), mirroring the normal send button. */
  disabled?: boolean;
};

/**
 * The send button while a run is generating: it takes over the send/stop slot
 * (and `submitButtonRef`, so Enter's synthetic click routes here) whenever the
 * composer holds text — submitting steers or queues per the effective action.
 * Hovering it reveals the full action list with its shortcuts: steer, queue
 * (⌘/Ctrl+Enter routes to the non-default action), interrupt & steer
 * (⌘/Ctrl+Shift+Enter — stops writing now but keeps what is written), and
 * interrupt & send (⌥/Alt+Enter — discards the answer and starts over).
 * Clearing the composer restores the Stop button.
 */
const DuringRunSendButton = React.memo(
  forwardRef((props: DuringRunSendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    const steerInterruptsByDefault = useRecoilValue(store.steerInterruptsByDefault);
    const enterToSend = useRecoilValue(store.enterToSend);
    const { shortcutsEnabled, submitOverride, yieldedChords } = useComposerBindings();
    const { steering } = props;
    const data = useWatch({ control: props.control });
    const content = data?.text?.trim();
    const primary = steering.effectiveAction;
    const modEnter = isMacPlatform ? '⌘⏎' : 'Ctrl ⏎';
    const altEnter = isMacPlatform ? '⌥⏎' : 'Alt ⏎';
    const modShiftEnter = isMacPlatform ? '⌘⇧⏎' : 'Ctrl ⇧ ⏎';

    /**
     * What each canonical chord actually does right now, asked of the same
     * decision table the composer executes. A hint only appears on a row its
     * chord still triggers: a chord rebound to a global shortcut (or claimed
     * by a rebound submit) is dropped rather than advertised on a row it no
     * longer reaches, and with Enter-to-send off, plain Enter inserts a
     * newline during a run, so ⌘/Ctrl+Enter carries the default action.
     */
    const verdicts = useMemo(() => {
      const ctx: ComposerKeyContext = {
        isComposing: false,
        isSubmitting: true,
        allowSubmitWhileGenerating: true,
        hasDuringRunModifier: true,
        shortcutsEnabled,
        enterToSend,
        submitOverride,
        yieldedChords,
      };
      const chord = (init: Partial<KeyChordSource>) =>
        resolveComposerKeyDown(
          { key: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...init },
          ctx,
        );
      const mod = isMacPlatform ? { metaKey: true } : { ctrlKey: true };
      return {
        plainEnter: chord({}),
        modEnter: chord(mod),
        modShiftEnter: chord({ ...mod, shiftKey: true }),
        altEnter: chord({ altKey: true }),
      };
    }, [enterToSend, shortcutsEnabled, submitOverride, yieldedChords]);

    /**
     * With the preference on, plain Enter routes through `submitDuringRun`,
     * which preempts. The hint has to follow it: leaving ⏎ on the ordinary
     * Steer row would advertise a key that does something else, and that row
     * deliberately stays non-preempting when CLICKED. No key reaches it in
     * this mode, so it shows none.
     */
    const enterInterrupts = primary === 'steer' && steerInterruptsByDefault;
    /** The chord that submits the default action, if any still does. */
    let submitHint: string | undefined;
    if (verdicts.plainEnter === 'submit') {
      submitHint = '⏎';
    } else if (verdicts.modEnter === 'submit') {
      submitHint = modEnter;
    }
    const alternateHint = verdicts.modEnter === 'other' ? modEnter : undefined;
    let interruptSteerKbd: string | undefined;
    if (enterInterrupts && submitHint != null) {
      interruptSteerKbd = submitHint;
    } else if (verdicts.modShiftEnter === 'preempt') {
      interruptSteerKbd = modShiftEnter;
    }

    const runAction = (action: (text: string) => boolean | void) => {
      const text = props.getText().trim();
      if (text.length === 0) {
        return;
      }
      if (action(text) !== false) {
        props.onConsumed();
      }
    };

    let steerKbd: string | undefined = alternateHint;
    if (primary === 'steer') {
      steerKbd = enterInterrupts ? undefined : submitHint;
    }

    const steerRow: ActionRow = {
      key: 'steer',
      label: localize('com_ui_steer'),
      kbd: steerKbd,
      icon: <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />,
      // Gate on availability, not the default action — the row exists to
      // override a queue-preferring default with an explicit steer.
      disabled: !steering.canSteer,
      onClick: () => runAction((text) => steering.steerFromComposer(text)),
    };
    const queueRow: ActionRow = {
      key: 'queue',
      label: localize('com_ui_queue'),
      kbd: primary === 'queue' ? submitHint : alternateHint,
      icon: <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />,
      onClick: () => runAction((text) => steering.queueFromComposer(text)),
    };
    /** Keeps the half-written answer, unlike interrupt & send below it. */
    const interruptSteerRow: ActionRow = {
      key: 'interrupt-steer',
      label: localize('com_ui_interrupt_steer'),
      kbd: interruptSteerKbd,
      icon: <ZapOff className="h-4 w-4 text-amber-500" aria-hidden="true" />,
      // Matches the standalone button's gate, and deliberately NOT
      // `!canSteer` like the steer row above: `canSteer` is also false before
      // a conversation exists, where `interruptSteer` falls back to interrupt
      // & send and this row must stay live for the whole first turn.
      disabled: steering.pausedOnApproval || !steering.canControlGeneration,
      onClick: () => runAction((text) => steering.interruptSteer(text)),
    };
    const interruptRow: ActionRow = {
      key: 'interrupt',
      label: localize('com_ui_interrupt_send'),
      kbd: verdicts.altEnter === 'interrupt' ? altEnter : undefined,
      icon: <OctagonPause className="h-4 w-4 text-red-500" aria-hidden="true" />,
      disabled: !steering.canControlGeneration,
      onClick: () => runAction((text) => steering.interruptAndSend(text)),
    };
    const rows = primary === 'steer' ? [steerRow, queueRow] : [queueRow, steerRow];
    rows.push(interruptSteerRow, interruptRow);

    const label =
      primary === 'steer' ? localize('com_ui_steer_send') : localize('com_ui_queue_send');

    return (
      <Ariakit.HovercardProvider placement="top-end" showTimeout={100} hideTimeout={150}>
        <Ariakit.HovercardAnchor
          render={
            <button
              ref={ref}
              aria-label={label}
              id="during-run-send-button"
              disabled={!content || props.disabled === true}
              className={cn(
                'size-theme-control rounded-theme-control-round bg-text-primary p-theme-compact text-text-primary outline-offset-4 transition-all duration-theme-normal disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
              )}
              data-testid="during-run-send-button"
              data-during-run-action={primary}
              type="submit"
            >
              <span data-state="closed">
                <SendIcon size={24} />
              </span>
            </button>
          }
        />
        <Ariakit.Hovercard
          portal
          gutter={8}
          unmountOnHide
          aria-label={localize('com_ui_during_run_actions')}
          className="z-50 min-w-[12rem] rounded-xl border border-border-light bg-surface-secondary p-1.5 text-text-primary shadow-lg outline-none"
        >
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className={ROW_CLASS}
              aria-disabled={row.disabled === true}
              onClick={row.disabled === true ? undefined : row.onClick}
            >
              {row.icon}
              {row.label}
              {/* A disabled row's action refuses its chord too, so no hint. */}
              {row.kbd != null && row.disabled !== true && <Kbd>{row.kbd}</Kbd>}
            </button>
          ))}
        </Ariakit.Hovercard>
      </Ariakit.HovercardProvider>
    );
  }),
);

export default DuringRunSendButton;
