import React, { memo, useState, useCallback, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { Expand, ChevronUp, ChevronDown } from 'lucide-react';
import { Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidHeaderProps {
  className?: string;
  codeContent: string;
  showCode: boolean;
  showExpandButton?: boolean;
  expandButtonRef?: React.RefObject<HTMLButtonElement>;
  onExpand?: () => void;
  onToggleCode: () => void;
}

const iconBtnClass =
  'flex items-center justify-center rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy';

const MermaidHeader: React.FC<MermaidHeaderProps> = memo(
  ({
    className,
    codeContent,
    showCode,
    showExpandButton = false,
    expandButtonRef,
    onExpand,
    onToggleCode,
  }) => {
    const localize = useLocalize();
    const [isCopied, setIsCopied] = useState(false);
    const copyButtonRef = useRef<HTMLButtonElement>(null);
    const showCodeButtonRef = useRef<HTMLButtonElement>(null);

    const handleCopy = useCallback(() => {
      copy(codeContent.trim(), { format: 'text/plain' });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }, [codeContent]);

    const handleToggleCode = useCallback(() => {
      onToggleCode();
      requestAnimationFrame(() => {
        showCodeButtonRef.current?.focus();
      });
    }, [onToggleCode]);

    return (
      <div
        className={cn(
          'flex items-center justify-end gap-1 px-2 py-1 transition-opacity duration-200',
          className,
        )}
      >
        {showExpandButton && onExpand && (
          <TooltipAnchor
            description={localize('com_ui_expand')}
            render={
              <button
                ref={expandButtonRef}
                type="button"
                aria-label={localize('com_ui_expand')}
                className={iconBtnClass}
                onClick={onExpand}
              >
                <Expand className="h-4 w-4" />
              </button>
            }
          />
        )}
        <TooltipAnchor
          description={showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
          render={
            <button
              ref={showCodeButtonRef}
              type="button"
              aria-label={showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
              className={iconBtnClass}
              onClick={handleToggleCode}
            >
              {showCode ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        />
        <TooltipAnchor
          description={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
          render={
            <button
              ref={copyButtonRef}
              type="button"
              aria-label={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
              className={iconBtnClass}
              onClick={handleCopy}
            >
              {isCopied ? (
                <CheckMark className="h-[18px] w-[18px]" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
            </button>
          }
        />
      </div>
    );
  },
);

MermaidHeader.displayName = 'MermaidHeader';

export default MermaidHeader;
