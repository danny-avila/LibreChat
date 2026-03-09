import React from 'react';
import { InfoIcon } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { CodeBarProps } from '~/common';
import CopyCodeButton from '~/components/Messages/Content/CopyCodeButton';
import useCopyCode from '~/components/Messages/Content/useCopyCode';
import RunCode from '~/components/Messages/Content/RunCode';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface FloatingCodeBarProps extends CodeBarProps {
  isVisible: boolean;
}

const FloatingCodeBar: React.FC<FloatingCodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true, isVisible }) => {
    const localize = useLocalize();
    const { isCopied, buttonRef, handleCopy } = useCopyCode(codeRef);
    const copyLabel = isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code');

    return (
      <div
        className={cn(
          'absolute bottom-2 right-2 flex items-center gap-2 font-sans text-xs text-text-secondary transition-opacity duration-150',
          isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {plugin === true ? (
          <InfoIcon className="flex h-4 w-4 gap-2 text-text-secondary" />
        ) : (
          <>
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} iconOnly />
            )}
            <TooltipAnchor
              description={copyLabel}
              render={
                <CopyCodeButton
                  ref={buttonRef}
                  isCopied={isCopied}
                  tabIndex={isVisible ? 0 : -1}
                  className={cn(
                    'flex items-center justify-center rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-secondary focus:outline focus:outline-2 focus:outline-border-heavy',
                    error === true ? 'h-4 w-4' : '',
                  )}
                  onClick={handleCopy}
                />
              }
            />
          </>
        )}
      </div>
    );
  },
);

export default FloatingCodeBar;
