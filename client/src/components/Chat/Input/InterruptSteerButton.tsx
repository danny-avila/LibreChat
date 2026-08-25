import React from 'react';
import { ZapOff } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type InterruptSteerButtonProps = {
  steering: SteeringControls;
  getText: () => string;
  onConsumed: () => void;
  /** External hold (e.g. uploads in flight), mirroring the send button. */
  disabled?: boolean;
};

/**
 * Always-visible composer control with one fixed meaning: stop writing now,
 * keep what is written, and steer from here. Distinct from the send button's
 * hovercard, whose primary action follows the user's during-run preference —
 * this one never changes what it does.
 *
 * `type="button"`: the composer footer sits inside the chat form, and only
 * `DuringRunSendButton` may receive Enter's synthetic submit.
 */
const InterruptSteerButton = React.memo((props: InterruptSteerButtonProps) => {
  const localize = useLocalize();
  const { steering } = props;
  const label = localize('com_ui_interrupt_steer_button');
  /** Pre-empts the server's 409: a paused run cannot accept a steer. */
  const disabled =
    props.disabled === true || steering.pausedOnApproval || !steering.canControlGeneration;

  const onClick = () => {
    const text = props.getText().trim();
    if (text.length === 0) {
      return;
    }
    if (steering.interruptSteer(text) !== false) {
      props.onConsumed();
    }
  };

  return (
    <Ariakit.TooltipProvider placement="top" timeout={300}>
      <Ariakit.TooltipAnchor
        render={
          <button
            type="button"
            aria-label={label}
            data-testid="interrupt-steer-button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              'flex size-theme-control items-center justify-center rounded-theme-control-round border border-border-light',
              'text-text-secondary transition-colors duration-theme-normal',
              'hover:bg-surface-composer-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            <ZapOff className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <Ariakit.Tooltip className="z-50 rounded-lg bg-surface-tertiary px-2 py-1 text-xs text-text-primary shadow-lg">
        {localize('com_ui_interrupt_steer_desc')}
      </Ariakit.Tooltip>
    </Ariakit.TooltipProvider>
  );
});

InterruptSteerButton.displayName = 'InterruptSteerButton';

export default InterruptSteerButton;
