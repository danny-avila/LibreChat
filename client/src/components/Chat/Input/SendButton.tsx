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
                'disabled:bg absolute rounded-full bg-text-primary p-1 text-text-primary outline-offset-4 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
                props.isRTL
                  ? 'bottom-1.5 left-2 md:bottom-2.5 md:left-2.5'
                  : 'bottom-1.5 right-2 md:bottom-2.5 md:right-2.5',
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
