import React, { memo, useState, useCallback, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { Expand, ChevronUp, ChevronDown } from 'lucide-react';
import { Button, Clipboard, CheckMark } from '@librechat/client';
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

const buttonClasses =
  'h-auto gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0';

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
          'flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700/80 px-4 py-2 font-sans text-xs text-gray-200 backdrop-blur-sm transition-opacity duration-200',
          className,
        )}
      >
        <span>{localize('com_ui_mermaid')}</span>
        <div className="ml-auto flex gap-2">
          {showExpandButton && onExpand && (
            <Button
              ref={expandButtonRef}
              variant="ghost"
              size="sm"
              className={buttonClasses}
              onClick={onExpand}
              title={localize('com_ui_expand')}
            >
              <Expand className="h-4 w-4" />
              {localize('com_ui_expand')}
            </Button>
          )}
          <Button
            ref={showCodeButtonRef}
            variant="ghost"
            size="sm"
            className={cn(buttonClasses, 'min-w-[6rem]')}
            onClick={handleToggleCode}
          >
            {showCode ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
          </Button>
          <Button
            ref={copyButtonRef}
            variant="ghost"
            size="sm"
            className={buttonClasses}
            onClick={handleCopy}
          >
            {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
            {localize('com_ui_copy_code')}
          </Button>
        </div>
      </div>
    );
  },
);

MermaidHeader.displayName = 'MermaidHeader';

export default MermaidHeader;
