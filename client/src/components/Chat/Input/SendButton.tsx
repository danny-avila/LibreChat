import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { TooltipAnchor } from '~/components/ui';
import { SendIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
  isRTL: boolean;
};

const SubmitButton = React.memo(
  forwardRef(
    (props: { disabled: boolean; isRTL: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
      const localize = useLocalize();
      return (
        <TooltipAnchor
          description={localize('com_nav_send_message')}
          render={
            <button
              ref={ref}
              aria-label={localize('com_nav_send_message')}
              id="send-button"
              disabled={props.disabled}
              className={cn(
                'rounded-full bg-text-primary p-2 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
              )}
              data-testid="send-button"
              type="submit"
            >
              <span className="" data-state="closed">
                <SendIcon size={24} />
              </span>
            </button>
          }
        ></TooltipAnchor>
      );
    },
  ),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    return <SubmitButton ref={ref} disabled={props.disabled || !data.text} isRTL={props.isRTL} />;
  }),
);

export default SendButton;
