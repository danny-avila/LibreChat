import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
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
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={ref}
                aria-label={localize('com_nav_send_message')}
                id="send-button"
                disabled={props.disabled}
                className={cn(
                  'absolute rounded-lg border border-black p-0.5 text-white outline-offset-4 transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:disabled:bg-white',
                  props.isRTL
                    ? 'bottom-1.5 left-2 md:bottom-3 md:left-3'
                    : 'bottom-1.5 right-2 md:bottom-3 md:right-3',
                )}
                data-testid="send-button"
                type="submit"
              >
                <span className="" data-state="closed">
                  <SendIcon size={24} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={10}>
              {localize('com_nav_send_message')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
