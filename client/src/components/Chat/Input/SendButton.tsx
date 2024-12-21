import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import { useSetRecoilState } from 'recoil';
import type { TRealtimeEphemeralTokenResponse } from 'librechat-data-provider';
import type { Control } from 'react-hook-form';
import { useRealtimeEphemeralTokenMutation } from '~/data-provider';
import { TooltipAnchor, SendIcon, CallIcon } from '~/components';
import { useToastContext } from '~/Providers/ToastContext';
import { useLocalize } from '~/hooks';
import store from '~/store';
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
      onClick?: () => void;
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
            onClick={props.onClick}
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
  const { showToast } = useToastContext();
  const { text = '' } = useWatch({ control: props.control });
  const setCallOpen = useSetRecoilState(store.callDialogOpen(0));

  // const { mutate: startCall, isLoading: isProcessing } = useRealtimeEphemeralTokenMutation({
  //   onSuccess: async (data: TRealtimeEphemeralTokenResponse) => {
  //     showToast({
  //       message: 'IT WORKS!!',
  //       status: 'success',
  //     });
  //   },
  //   onError: (error: unknown) => {
  //     showToast({
  //       message: localize('com_nav_audio_process_error', (error as Error).message),
  //       status: 'error',
  //     });
  //   },
  // });

  const handleClick = () => {
    if (text.trim() === '') {
      setCallOpen(true);
      // startCall({ voice: 'verse' });
    }
  };

  const buttonProps =
    text.trim() !== ''
      ? {
        icon: <SendIcon size={24} />,
        tooltip: localize('com_nav_send_message'),
        testId: 'send-button',
      }
      : {
        icon: <CallIcon size={24} />,
        tooltip: localize('com_nav_call'),
        testId: 'call-button',
        onClick: handleClick,
      };

  return <ActionButton ref={ref} disabled={props.disabled} {...buttonProps} />;
});

SendButton.displayName = 'SendButton';

export default SendButton;
