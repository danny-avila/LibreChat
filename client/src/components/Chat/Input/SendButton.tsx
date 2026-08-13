import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import { SendIcon, IconButton, TooltipAnchor } from '@librechat/client';
import type { Control } from 'react-hook-form';
import { useLocalize } from '~/hooks';

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
          <IconButton
            ref={ref}
            label={localize('com_nav_send_message')}
            variant="primary"
            size="theme"
            shape="theme"
            disabled={props.disabled}
            className="duration-theme-normal disabled:opacity-30"
            data-testid="send-button"
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={18} />
            </span>
          </IconButton>
        }
      />
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    const content = data?.text?.trim();
    return <SubmitButton ref={ref} disabled={props.disabled || !content} />;
  }),
);

export default SendButton;
