import React from 'react';
import { Copy, Check } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface CopyCodeButtonProps {
  isCopied: boolean;
  iconOnly?: boolean;
  onClick: () => void;
  tabIndex?: number;
  className?: string;
}

const CopyCodeButton = React.forwardRef<HTMLButtonElement, CopyCodeButtonProps>(
  ({ isCopied, iconOnly = false, onClick, tabIndex, className }, ref) => {
    const localize = useLocalize();
    const label = isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code');

    const button = (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        tabIndex={tabIndex}
        aria-label={label}
        className={cn(
          'inline-flex select-none items-center justify-center text-text-secondary transition-all duration-200 ease-out',
          'hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy',
          'active:scale-95',
          iconOnly ? 'rounded-lg p-1.5' : 'ml-auto gap-2 rounded-md px-2 py-1',
          isCopied && 'text-text-secondary hover:text-text-primary',
          className,
        )}
      >
        <span className="relative flex size-[18px] items-center justify-center" aria-hidden="true">
          <Copy
            size={18}
            className={cn(
              'absolute transition-all duration-300 ease-out',
              isCopied ? 'rotate-[-90deg] scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
            )}
          />
          <Check
            size={18}
            className={cn(
              'transition-all duration-300 ease-out',
              isCopied ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0',
            )}
          />
        </span>
        {!iconOnly && (
          <span className="relative overflow-hidden">
            <span
              className={cn(
                'block transition-all duration-300 ease-out',
                isCopied ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100',
              )}
            >
              {localize('com_ui_copy_code')}
            </span>
            <span
              className={cn(
                'absolute inset-0 transition-all duration-300 ease-out',
                isCopied ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
              )}
            >
              {localize('com_ui_copied')}
            </span>
          </span>
        )}
      </button>
    );

    if (iconOnly) {
      return <TooltipAnchor description={label} render={button} />;
    }

    return button;
  },
);

CopyCodeButton.displayName = 'CopyCodeButton';

export default CopyCodeButton;
