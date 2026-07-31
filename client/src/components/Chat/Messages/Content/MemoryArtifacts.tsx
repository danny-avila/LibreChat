import { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type { MemoryArtifact, TAttachment } from 'librechat-data-provider';
import { disclosureChevronClassName, toolPanelSpacingClassName } from './disclosure';
import { useExpandCollapse, useLocalize } from '~/hooks';
import MemoryInfo from './MemoryInfo';
import { cn } from '~/utils';

export default function MemoryArtifacts({ attachments }: { attachments?: TAttachment[] }) {
  const contentId = useId();
  const localize = useLocalize();
  const [showInfo, setShowInfo] = useState(false);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showInfo);

  const { hasErrors, memoryArtifacts } = useMemo(() => {
    let hasErrors = false;
    const result: MemoryArtifact[] = [];

    if (!attachments || attachments.length === 0) {
      return { hasErrors, memoryArtifacts: result };
    }

    for (const attachment of attachments) {
      if (attachment?.[Tools.memory] != null) {
        result.push(attachment[Tools.memory]);

        if (!hasErrors && attachment[Tools.memory].type === 'error') {
          hasErrors = true;
        }
      }
    }

    return { hasErrors, memoryArtifacts: result };
  }, [attachments]);

  if (!memoryArtifacts || memoryArtifacts.length === 0) {
    return null;
  }

  return (
    <>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <button
          className={cn(
            'group/disclosure inline-flex w-full items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
            hasErrors ? 'text-status-error' : 'text-text-secondary',
          )}
          type="button"
          onClick={() => setShowInfo((prev) => !prev)}
          aria-expanded={showInfo}
          aria-controls={contentId}
          aria-label={localize('com_ui_memory_updated')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="size-4 shrink-0"
            aria-hidden="true"
          >
            <path
              d="M6 3C4.89543 3 4 3.89543 4 5V13C4 14.1046 4.89543 15 6 15L6 3Z"
              fill="currentColor"
            />
            <path
              d="M7 3V15H8.18037L8.4899 13.4523C8.54798 13.1619 8.69071 12.8952 8.90012 12.6858L12.2931 9.29289C12.7644 8.82153 13.3822 8.58583 14 8.58578V3.5C14 3.22386 13.7761 3 13.5 3H7Z"
              fill="currentColor"
            />
            <path
              d="M11.3512 15.5297L9.73505 15.8529C9.38519 15.9229 9.07673 15.6144 9.14671 15.2646L9.46993 13.6484C9.48929 13.5517 9.53687 13.4628 9.60667 13.393L12.9996 10C13.5519 9.44771 14.4473 9.44771 14.9996 10C15.5519 10.5523 15.5519 11.4477 14.9996 12L11.6067 15.393C11.5369 15.4628 11.448 15.5103 11.3512 15.5297Z"
              fill="currentColor"
            />
          </svg>
          <span className="tool-status-text font-medium">
            {hasErrors ? localize('com_ui_memory_error') : localize('com_ui_memory_updated')}
          </span>
          <ChevronDown
            className={cn(
              disclosureChevronClassName,
              'size-4 translate-y-[1px]',
              showInfo && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        id={contentId}
        style={expandStyle}
        role="group"
        aria-label={localize('com_ui_memory_updated')}
        aria-hidden={!showInfo || undefined}
      >
        <div className="overflow-hidden" ref={expandRef}>
          <div
            className={cn(
              toolPanelSpacingClassName,
              'overflow-hidden rounded-lg border border-border-light bg-surface-secondary',
            )}
          >
            {showInfo && <MemoryInfo key="memory-info" memoryArtifacts={memoryArtifacts} />}
          </div>
        </div>
      </div>
    </>
  );
}
