import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
};

const SubmitButton = React.memo(
  forwardRef((props: { disabled: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
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
              'flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-white shadow-[0_4px_12px_-2px_rgba(11,47,91,0.45)] outline-offset-4 transition-all duration-200',
              'hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none',
              'dark:bg-signal-amber dark:text-dm-ambient dark:shadow-[0_4px_12px_-2px_rgba(242,182,68,0.45)] dark:hover:bg-[#F5C566]',
            )}
            data-testid="send-button"
            type="submit"
          >
            <span className="text-white dark:text-dm-ambient" data-state="closed">
              <SendIcon size={18} className="text-white dark:text-dm-ambient" />
            </span>
          </button>
        }
      />
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    return <SubmitButton ref={ref} disabled={props.disabled || !data.text} />;
  }),
);

export default SendButton;
