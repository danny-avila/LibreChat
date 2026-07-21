import React, { forwardRef } from 'react';
import * as Ariakit from '@ariakit/react';
import { useWatch } from 'react-hook-form';
import { SendIcon } from '@librechat/client';
import { Zap, Clock, OctagonPause } from 'lucide-react';
import type { Control } from 'react-hook-form';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { isMacPlatform } from '~/utils/shortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
  kbd: string;
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
 * (⌘/Ctrl+Enter routes to the non-default action), and interrupt & send
 * (⌥/Alt+Enter). Clearing the composer restores the Stop button.
 */
const DuringRunSendButton = React.memo(
  forwardRef((props: DuringRunSendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    const { steering } = props;
    const data = useWatch({ control: props.control });
    const content = data?.text?.trim();
    const primary = steering.effectiveAction;
    const modEnter = isMacPlatform ? '⌘⏎' : 'Ctrl ⏎';
    const altEnter = isMacPlatform ? '⌥⏎' : 'Alt ⏎';

    const runAction = (action: (text: string) => boolean | void) => {
      const text = props.getText().trim();
      if (text.length === 0) {
        return;
      }
      if (action(text) !== false) {
        props.onConsumed();
      }
    };

    const steerRow: ActionRow = {
      key: 'steer',
      label: localize('com_ui_steer'),
      kbd: primary === 'steer' ? '⏎' : modEnter,
      icon: <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />,
      // Gate on availability, not the default action — the row exists to
      // override a queue-preferring default with an explicit steer.
      disabled: !steering.canSteer,
      onClick: () => runAction((text) => steering.steerFromComposer(text)),
    };
    const queueRow: ActionRow = {
      key: 'queue',
      label: localize('com_ui_queue'),
      kbd: primary === 'queue' ? '⏎' : modEnter,
      icon: <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />,
      onClick: () => runAction((text) => steering.queueFromComposer(text)),
    };
    const interruptRow: ActionRow = {
      key: 'interrupt',
      label: localize('com_ui_interrupt_send'),
      kbd: altEnter,
      icon: <OctagonPause className="h-4 w-4 text-red-500" aria-hidden="true" />,
      onClick: () => runAction((text) => steering.interruptAndSend(text)),
    };
    const rows = primary === 'steer' ? [steerRow, queueRow] : [queueRow, steerRow];
    rows.push(interruptRow);

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
                'rounded-full bg-text-primary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
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
              <Kbd>{row.kbd}</Kbd>
            </button>
          ))}
        </Ariakit.Hovercard>
      </Ariakit.HovercardProvider>
    );
  }),
);

export default DuringRunSendButton;
