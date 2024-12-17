import React, { forwardRef } from 'react';
import { TooltipAnchor } from '~/components/ui';
import { SendIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const Button = React.memo(
  forwardRef((props: { disabled: boolean }) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_nav_call_mode')}
        render={
          <button
            aria-label={localize('com_nav_send_message')}
            id="call-button"
            disabled={props.disabled}
            className={cn(
              'rounded-full bg-text-primary p-2 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
            )}
            data-testid="call-button"
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={24} />
            </span>
          </button>
        }
      ></TooltipAnchor>
    );
  }),
);

const CallButton = React.memo(
  forwardRef((props: { disabled: boolean }) => {
    return <Button disabled={props.disabled} />;
  }),
);

export default CallButton;
