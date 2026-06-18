import React from 'react';
import { InfoIcon } from 'lucide-react';
import type { CodeBarProps } from '~/common';
import useCopyCode from '~/components/Messages/Content/useCopyCode';
import CopyButton from '~/components/Messages/Content/CopyButton';
import RunCode from '~/components/Messages/Content/RunCode';
import cn from '~/utils/cn';

interface FloatingCodeBarProps extends CodeBarProps {
  isVisible: boolean;
}

const FloatingCodeBar: React.FC<FloatingCodeBarProps> = React.memo(
  ({ lang, codeRef, blockIndex, plugin = null, allowExecution = true, isVisible }) => {
    const { isCopied, buttonRef, handleCopy } = useCopyCode(codeRef);

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
            <CopyButton
              ref={buttonRef}
              isCopied={isCopied}
              iconOnly
              tabIndex={isVisible ? 0 : -1}
              onClick={handleCopy}
            />
          </>
        )}
      </div>
    );
  },
);

export default FloatingCodeBar;
