import React from 'react';
import { Copy, Check } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface CopyButtonProps {
  isCopied: boolean;
  iconOnly?: boolean;
  onClick: () => void;
  tabIndex?: number;
  className?: string;
  label?: string;
  copiedLabel?: string;
}

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ isCopied, iconOnly = false, onClick, tabIndex, className, label, copiedLabel }, ref) => {
    const localize = useLocalize();
    const defaultLabel = label ?? localize('com_ui_copy');
    const defaultCopiedLabel = copiedLabel ?? localize('com_ui_copied');
    const currentLabel = isCopied ? defaultCopiedLabel : defaultLabel;

    const button = (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        tabIndex={tabIndex}
        aria-label={currentLabel}
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
              {defaultLabel}
            </span>
            <span
              className={cn(
                'absolute inset-0 transition-all duration-300 ease-out',
                isCopied ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
              )}
            >
              {defaultCopiedLabel}
            </span>
          </span>
        )}
      </button>
    );

    if (iconOnly) {
      return <TooltipAnchor description={currentLabel} render={button} />;
    }

    return button;
  },
);

CopyButton.displayName = 'CopyButton';

export default CopyButton;
