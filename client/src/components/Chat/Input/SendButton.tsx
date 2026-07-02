import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import { useBrand, useLocalize } from '~/hooks';
import { cn, interpolateBrandField } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
};

const SubmitButton = React.memo(
  forwardRef((props: { disabled: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    const { getControl } = useBrand();
    /** Additive brand overrides for automation attributes only. A `null` field
     * (or no active brand) keeps LibreChat's native value — a no-op otherwise.
     * The visible tooltip (`description`) stays native. */
    const brand = getControl('send_button');
    return (
      <TooltipAnchor
        description={localize('com_nav_send_message')}
        render={
          <button
            ref={ref}
            aria-label={interpolateBrandField(brand?.aria) ?? localize('com_nav_send_message')}
            id={brand?.id ?? 'send-button'}
            disabled={props.disabled}
            className={cn(
              'rounded-full bg-text-primary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
            )}
            data-testid={brand?.testid ?? 'send-button'}
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={24} />
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
    const content = data?.text?.trim();
    return <SubmitButton ref={ref} disabled={props.disabled || !content} />;
  }),
);

export default SendButton;
