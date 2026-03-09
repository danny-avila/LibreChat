import React from 'react';
import { Clipboard, CheckMark } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface CopyCodeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isCopied: boolean;
  showLabel?: boolean;
}

const CopyCodeButton = React.forwardRef<HTMLButtonElement, CopyCodeButtonProps>(
  ({ isCopied, showLabel, ...props }, ref) => {
    const localize = useLocalize();
    const label = isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code');

    return (
      <button
        ref={ref}
        type="button"
        aria-label={showLabel !== true ? label : undefined}
        {...props}
      >
        {isCopied ? (
          <CheckMark className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Clipboard aria-hidden="true" />
        )}
        {showLabel === true && (
          <span className="relative">
            <span className="invisible">{localize('com_ui_copy_code')}</span>
            <span className="absolute inset-0 flex items-center">{label}</span>
          </span>
        )}
      </button>
    );
  },
);

CopyCodeButton.displayName = 'CopyCodeButton';

export default CopyCodeButton;
