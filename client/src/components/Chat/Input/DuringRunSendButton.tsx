import React, { forwardRef } from 'react';
import { Zap, Clock } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { TooltipAnchor } from '@librechat/client';
import type { Control } from 'react-hook-form';
import type { DuringRunAction } from '~/hooks/Chat/useSteering';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type DuringRunSendButtonProps = {
  control: Control<{ text: string }>;
  action: DuringRunAction;
};

/**
 * The during-run submit button, mounted beside Stop while a run is generating
 * and the composer holds text. Takes over `submitButtonRef` so Enter's
 * synthetic click routes here; the form's onSubmit then dispatches to
 * steer/queue via `useSteering.submitDuringRun`. The icon + tooltip announce
 * what Enter will do (Zap = steer into the live run, Clock = queue for after).
 */
const DuringRunSendButton = React.memo(
  forwardRef((props: DuringRunSendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    const data = useWatch({ control: props.control });
    const content = data?.text?.trim();
    const label =
      props.action === 'steer' ? localize('com_ui_steer_send') : localize('com_ui_queue_send');
    return (
      <TooltipAnchor
        description={label}
        render={
          <button
            ref={ref}
            aria-label={label}
            id="during-run-send-button"
            disabled={!content}
            className={cn(
              'rounded-full bg-surface-secondary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-10',
            )}
            data-testid="during-run-send-button"
            data-during-run-action={props.action}
            type="submit"
          >
            {props.action === 'steer' ? (
              <Zap size={20} className="text-amber-500" aria-hidden="true" />
            ) : (
              <Clock size={20} className="text-cyan-500" aria-hidden="true" />
            )}
          </button>
        }
      />
    );
  }),
);

export default DuringRunSendButton;
