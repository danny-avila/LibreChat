import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import { CheckIcon } from 'lucide-react';
import { DialogButton } from '~/components/ui';
import { Spinner } from '~/components/svg';
import type { TDangerButtonProps } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const DangerButton = (props: TDangerButtonProps, ref: ForwardedRef<HTMLButtonElement>) => {
  const {
    id,
    onClick,
    mutation,
    disabled,
    confirmClear,
    infoTextCode,
    actionTextCode,
    className = '',
    showText = true,
    dataTestIdInitial,
    dataTestIdConfirm,
    confirmActionTextCode = 'com_ui_confirm_action',
  } = props;
  const localize = useLocalize();

  const renderMutation = (node: React.ReactNode | string) => {
    if (mutation && mutation.isLoading) {
      return <Spinner className="h-5 w-5" />;
    }
    return node;
  };

  return (
    <div className="flex items-center justify-between">
      {showText && <div> {localize(infoTextCode)} </div>}
      <DialogButton
        id={id}
        ref={ref}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          ' btn btn-danger relative border-none bg-red-700 text-white hover:bg-red-800 dark:hover:bg-red-800',
          className,
        )}
      >
        {confirmClear ? (
          <div
            className="flex w-full items-center justify-center gap-2"
            id={`${id}-text`}
            data-testid={dataTestIdConfirm}
          >
            {renderMutation(<CheckIcon className="h-5 w-5" />)}
            {mutation && mutation.isLoading ? null : localize(confirmActionTextCode)}
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center gap-2"
            id={`${id}-text`}
            data-testid={dataTestIdInitial}
          >
            {renderMutation(localize(actionTextCode))}
          </div>
        )}
      </DialogButton>
    </div>
  );
};

export default forwardRef(DangerButton);
