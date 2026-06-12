import React from 'react';
import { Download, Check } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface DownloadButtonProps {
  isDownloaded: boolean;
  iconOnly?: boolean;
  onClick: () => void;
  tabIndex?: number;
  className?: string;
  label?: string;
  downloadedLabel?: string;
}

const DownloadButton = React.forwardRef<HTMLButtonElement, DownloadButtonProps>(
  (
    { isDownloaded, iconOnly = false, onClick, tabIndex, className, label, downloadedLabel },
    ref,
  ) => {
    const localize = useLocalize();
    const defaultLabel = label ?? localize('com_ui_download');
    const defaultDownloadedLabel = downloadedLabel ?? localize('com_ui_downloaded');
    const currentLabel = isDownloaded ? defaultDownloadedLabel : defaultLabel;

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
          iconOnly ? 'rounded-lg p-1.5' : 'ml-auto gap-2 rounded-md px-2 py-1',
          isDownloaded && 'text-text-secondary hover:text-text-primary',
          className,
        )}
      >
        <span className="relative flex size-[18px] items-center justify-center" aria-hidden="true">
          <Download
            size={18}
            className={cn(
              'absolute transition-all duration-300 ease-out',
              isDownloaded ? 'rotate-[-90deg] scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
            )}
          />
          <Check
            size={18}
            className={cn(
              'transition-all duration-300 ease-out',
              isDownloaded ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0',
            )}
          />
        </span>
        {!iconOnly && (
          <span className="relative overflow-hidden">
            <span
              className={cn(
                'block transition-all duration-300 ease-out',
                isDownloaded ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100',
              )}
            >
              {defaultLabel}
            </span>
            <span
              className={cn(
                'absolute inset-0 transition-all duration-300 ease-out',
                isDownloaded ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
              )}
            >
              {defaultDownloadedLabel}
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

DownloadButton.displayName = 'DownloadButton';

export default DownloadButton;
