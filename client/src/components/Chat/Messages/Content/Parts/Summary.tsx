import { memo, useMemo, useState, useCallback, useRef, useId, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import type { MouseEvent, FocusEvent } from 'react';
import type { SummaryContentPart } from 'librechat-data-provider';
import { fontSizeAtom } from '~/store/fontSize';
import { useMessageContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SummaryProps = Pick<
  SummaryContentPart,
  'content' | 'model' | 'provider' | 'tokenCount' | 'summarizing'
>;

function useCopyToClipboard(content?: string) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const handleCopy = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (content) {
        navigator.clipboard.writeText(content).then(
          () => {
            clearTimeout(timerRef.current);
            setIsCopied(true);
            timerRef.current = setTimeout(() => setIsCopied(false), 2000);
          },
          () => {
            /* clipboard permission denied — leave icon unchanged */
          },
        );
      }
    },
    [content],
  );
  return { isCopied, handleCopy };
}

const SummaryContent = memo(({ children, meta }: { children: React.ReactNode; meta?: string }) => {
  const fontSize = useAtomValue(fontSizeAtom);

  return (
    <div className="relative rounded-3xl border border-border-medium bg-surface-tertiary p-4 pb-10 text-text-secondary">
      {meta && <span className="mb-1 block text-xs text-text-secondary">{meta}</span>}
      <p className={cn('whitespace-pre-wrap leading-[26px]', fontSize)}>{children}</p>
    </div>
  );
});

const SummaryButton = memo(
  ({
    isExpanded,
    onClick,
    label,
    content,
    contentId,
    showCopyButton = true,
    isCopied,
    onCopy,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
    content?: string;
    contentId: string;
    showCopyButton?: boolean;
    isCopied: boolean;
    onCopy: (e: MouseEvent<HTMLButtonElement>) => void;
  }) => {
    const localize = useLocalize();
    const fontSize = useAtomValue(fontSizeAtom);

    return (
      <div className="group/summary flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClick}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          className={cn(
            'group/button flex flex-1 items-center justify-start rounded-lg leading-[18px]',
            fontSize,
          )}
        >
          <span className="relative mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center">
            <ScrollText
              className="icon-sm absolute text-text-secondary opacity-100 transition-opacity group-hover/button:opacity-0"
              aria-hidden="true"
            />
            <ChevronDown
              className={cn(
                'icon-sm absolute transform-gpu text-text-primary opacity-0 transition-all duration-300 group-hover/button:opacity-100',
                isExpanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </span>
          <span>{label}</span>
        </button>
        {content && showCopyButton && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={
              isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_summary')
            }
            className={cn(
              'rounded-lg p-1.5 text-text-secondary-alt',
              isExpanded
                ? 'opacity-0 group-focus-within/summary-container:opacity-100 group-hover/summary-container:opacity-100'
                : 'opacity-0',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',
            )}
          >
            <span className="sr-only">
              {isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_summary')}
            </span>
            {isCopied ? (
              <CheckMark className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Clipboard size="19" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );
  },
);

const FloatingSummaryBar = memo(
  ({
    isVisible,
    onClick,
    content,
    contentId,
    isCopied,
    onCopy,
  }: {
    isVisible: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    content?: string;
    contentId: string;
    isCopied: boolean;
    onCopy: (e: MouseEvent<HTMLButtonElement>) => void;
  }) => {
    const localize = useLocalize();

    const collapseTooltip = localize('com_ui_collapse_summary');
    const copyTooltip = isCopied
      ? localize('com_ui_copied_to_clipboard')
      : localize('com_ui_copy_summary');

    return (
      <div
        className={cn(
          'absolute bottom-3 right-3 flex items-center gap-2 transition-opacity duration-150',
          isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <TooltipAnchor
          description={collapseTooltip}
          render={
            <button
              type="button"
              tabIndex={isVisible ? 0 : -1}
              onClick={onClick}
              aria-label={collapseTooltip}
              aria-controls={contentId}
              className={cn(
                'flex items-center justify-center rounded-lg bg-surface-secondary p-1.5 text-text-secondary-alt shadow-sm',
                'hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
              )}
            >
              <ChevronUp className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          }
        />
        {content && (
          <TooltipAnchor
            description={copyTooltip}
            render={
              <button
                type="button"
                tabIndex={isVisible ? 0 : -1}
                onClick={onCopy}
                aria-label={copyTooltip}
                className={cn(
                  'flex items-center justify-center rounded-lg bg-surface-secondary p-1.5 text-text-secondary-alt shadow-sm',
                  'hover:bg-surface-hover hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
                )}
              >
                {isCopied ? (
                  <CheckMark className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : (
                  <Clipboard size="18" aria-hidden="true" />
                )}
              </button>
            }
          />
        )}
      </div>
    );
  },
);

const Summary = memo(({ content, model, provider, tokenCount, summarizing }: SummaryProps) => {
  const contentId = useId();
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isSubmitting, isLatestMessage } = useMessageContext();

  const text = useMemo(
    () =>
      (content ?? [])
        .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
        .join(''),
    [content],
  );
  const { isCopied, handleCopy } = useCopyToClipboard(text);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleFocus = useCallback(() => setIsBarVisible(true), []);
  const handleBlur = useCallback((e: FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsBarVisible(false);
    }
  }, []);
  const handleMouseEnter = useCallback(() => setIsBarVisible(true), []);
  const handleMouseLeave = useCallback(() => {
    if (!containerRef.current?.contains(document.activeElement)) {
      setIsBarVisible(false);
    }
  }, []);

  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;
  const isActivelyStreaming = !!summarizing && !!effectiveIsSubmitting;

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (provider || model) {
      parts.push([provider, model].filter(Boolean).join('/'));
    }
    if (tokenCount != null && tokenCount > 0) {
      parts.push(`${tokenCount} ${localize('com_ui_tokens')}`);
    }
    return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
  }, [model, provider, tokenCount, localize]);

  const label = useMemo(
    () =>
      isActivelyStreaming
        ? localize('com_ui_summarizing')
        : localize('com_ui_conversation_summarized'),
    [isActivelyStreaming, localize],
  );

  if (!summarizing && !text) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="group/summary"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div className="group/summary-container">
        <div className="mb-2 pb-2 pt-2">
          <SummaryButton
            isExpanded={isExpanded}
            onClick={handleClick}
            label={label}
            content={text}
            contentId={contentId}
            showCopyButton={!isActivelyStreaming}
            isCopied={isCopied}
            onCopy={handleCopy}
          />
        </div>
        <div
          id={contentId}
          role="region"
          aria-label={label}
          aria-hidden={!isExpanded || undefined}
          className={cn('grid transition-all duration-300 ease-out', isExpanded && 'mb-4')}
          style={{
            gridTemplateRows: isExpanded ? '1fr' : '0fr',
          }}
        >
          <div className="relative overflow-hidden">
            <SummaryContent meta={meta}>{text}</SummaryContent>
            <FloatingSummaryBar
              isVisible={isBarVisible && isExpanded}
              onClick={handleClick}
              content={text}
              contentId={contentId}
              isCopied={isCopied}
              onCopy={handleCopy}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

SummaryContent.displayName = 'SummaryContent';
SummaryButton.displayName = 'SummaryButton';
FloatingSummaryBar.displayName = 'FloatingSummaryBar';
Summary.displayName = 'Summary';

export default Summary;
