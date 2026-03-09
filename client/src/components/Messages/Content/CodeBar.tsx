import React from 'react';
import { InfoIcon } from 'lucide-react';
import type { CodeBarProps } from '~/common';
import CopyCodeButton from '~/components/Messages/Content/CopyCodeButton';
import useCopyCode from '~/components/Messages/Content/useCopyCode';
import LangIcon from '~/components/Messages/Content/LangIcon';
import RunCode from '~/components/Messages/Content/RunCode';
import cn from '~/utils/cn';

const CodeBar: React.FC<CodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true }) => {
    const { isCopied, handleCopy } = useCopyCode(codeRef);

    return (
      <div className="flex items-center justify-between px-3 py-1.5 font-sans text-xs text-text-secondary">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <LangIcon lang={lang} className="size-3.5" />
          {lang}
        </span>
        {plugin === true ? (
          <InfoIcon className="ml-auto flex h-4 w-4 gap-2 text-text-secondary" />
        ) : (
          <div className="flex items-center justify-center gap-2">
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} />
            )}
            <CopyCodeButton
              isCopied={isCopied}
              showLabel={error !== true}
              className={cn(
                'ml-auto flex gap-2 rounded-sm text-text-secondary transition-colors hover:text-text-secondary focus:outline focus:outline-2 focus:outline-border-heavy',
                error === true ? 'h-4 w-4 items-start' : '',
              )}
              onClick={handleCopy}
            />
          </div>
        )}
      </div>
    );
  },
);

export default CodeBar;
