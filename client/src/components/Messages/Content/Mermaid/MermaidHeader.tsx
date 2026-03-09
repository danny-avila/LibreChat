import React, { memo, useState, useCallback, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { Expand, ChevronUp, ChevronDown } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import CopyCodeButton from '~/components/Messages/Content/CopyCodeButton';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidHeaderProps {
  className?: string;
  actionsClassName?: string;
  codeContent: string;
  showCode: boolean;
  showExpandButton?: boolean;
  expandButtonRef?: React.RefObject<HTMLButtonElement>;
  onExpand?: () => void;
  onToggleCode: () => void;
}

const iconBtnClass =
  'flex items-center justify-center rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy';

const MermaidHeader: React.FC<MermaidHeaderProps> = memo(
  ({
    className,
    actionsClassName,
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
      <div className={cn('flex items-center justify-between gap-1 px-2 py-1', className)}>
        <span className="rounded text-xs font-medium text-text-secondary">
          {localize('com_ui_mermaid')}
        </span>
        <div className={cn('flex items-center gap-1', actionsClassName)}>
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
          <CopyCodeButton ref={copyButtonRef} isCopied={isCopied} iconOnly onClick={handleCopy} />
        </div>
      </div>
    );
  },
);

MermaidHeader.displayName = 'MermaidHeader';

export default MermaidHeader;
