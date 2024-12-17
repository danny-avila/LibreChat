import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { TooltipAnchor, SendIcon, CallIcon } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
};

const ActionButton = forwardRef(
  (
    props: {
      disabled: boolean;
      icon: React.ReactNode;
      tooltip: string;
      testId: string;
    },
    ref: React.ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <TooltipAnchor
        description={props.tooltip}
        render={
          <button
            ref={ref}
            aria-label={props.tooltip}
            id="action-button"
            disabled={props.disabled}
            className={cn(
              'rounded-full bg-text-primary p-2 text-text-primary outline-offset-4',
              'transition-all duration-200',
              'disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
            )}
            data-testid={props.testId}
            type="submit"
          >
            <span className="" data-state="closed">
              {props.icon}
            </span>
          </button>
        }
      />
    );
  },
);

const SendButton = forwardRef((props: ButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
  const localize = useLocalize();
  const { text } = useWatch({ control: props.control });

  const buttonProps = text
    ? {
      icon: <SendIcon size={24} />,
      tooltip: localize('com_nav_send_message'),
      testId: 'send-button',
    }
    : {
      icon: <CallIcon size={24} />,
      tooltip: localize('com_nav_call'),
      testId: 'call-button',
    };

  return <ActionButton ref={ref} disabled={props.disabled} {...buttonProps} />;
});

SendButton.displayName = 'SendButton';

export default SendButton;
