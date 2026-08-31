import { useState, useMemo, memo, useCallback, useRef, useId, type MouseEvent } from 'react';
import { useAtomValue } from 'jotai';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import type { FocusEvent, FC } from 'react';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { showThinkingAtom } from '~/store/showThinking';
import { fontSizeAtom } from '~/store/fontSize';
import { AnimatedText } from '../animate';
import { cn } from '~/utils';

/**
 * ThinkingContent - Displays the actual thinking/reasoning content
 * Used by both legacy text-based messages and modern content parts
 */
export const ThinkingContent: FC<{
  children: React.ReactNode;
  animate?: boolean;
}> = memo(({ children, animate = false }) => {
  const fontSize = useAtomValue(fontSizeAtom);
  const content =
    animate && typeof children === 'string' ? <AnimatedText text={children} /> : children;

  return (
    <div className="relative rounded-lg border border-border-light bg-surface-secondary p-3 pb-8 text-text-secondary">
      <p className={cn('whitespace-pre-wrap leading-[26px]', fontSize)}>{content}</p>
    </div>
  );
});

/**
 * ThinkingButton - Toggle button for expanding/collapsing thinking content
 * Shows lightbulb icon by default, chevron on hover
 * Shared between legacy Thinking component and modern ContentParts
 */
export const ThinkingButton = memo(
  ({
    isExpanded,
    onClick,
    label,
    content,
    contentId,
    showCopyButton = true,
    animateLabel = false,
    shimmerLabel = false,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
    content?: string;
    contentId: string;
    showCopyButton?: boolean;
    animateLabel?: boolean;
    /** Reasoning is still being generated: carry the same shimmer a running
     *  tool call's label carries, so "thinking" reads as in-flight rather
     *  than as a settled disclosure. Off for finished thoughts. */
    shimmerLabel?: boolean;
  }) => {
    const localize = useLocalize();
    const fontSize = useAtomValue(fontSizeAtom);

    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (content) {
          navigator.clipboard.writeText(content);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }
      },
      [content],
    );

    return (
      <div className="group/thinking flex w-full items-center justify-between gap-2">
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
            <Lightbulb
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
          {/* The entrance and the shimmer both drive `animation-name`, so they
              cannot share an element — and the nesting order is not a free
              choice either. The clipped element paints the glyphs itself, so a
              descendant's opacity cannot fade them: entrance outside and
              shimmer inside fades correctly, while the reverse leaves the label
              fully lit right through its own fade.

              `key` remounts the row so the entrance replays, and that restarts
              the sweep with it. Reasoning labels revise on a 3s default against
              a 4s sweep, so the restart is frequent; it reads as intentional
              only while the entrance is there to cover it. With no entrance to
              play, the row keeps its identity and the sweep runs unbroken. */}
          <span
            key={animateLabel ? label : undefined}
            className={cn(
              'min-w-0 truncate text-left',
              animateLabel &&
                'duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
            )}
          >
            {shimmerLabel ? <span className="shimmer max-w-full truncate">{label}</span> : label}
          </span>
        </button>
        {content && showCopyButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            aria-label={
              isCopied
                ? localize('com_ui_copied_to_clipboard')
                : localize('com_ui_copy_thoughts_to_clipboard')
            }
            className={cn(
              'size-auto gap-0 rounded-lg p-1.5 text-text-secondary-alt',
              isExpanded
                ? 'opacity-0 group-focus-within/thinking-container:opacity-100 group-hover/thinking-container:opacity-100'
                : 'opacity-0',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
            )}
          >
            <span className="sr-only">
              {isCopied
                ? localize('com_ui_copied_to_clipboard')
                : localize('com_ui_copy_thoughts_to_clipboard')}
            </span>
            {isCopied ? (
              <CheckMark className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Clipboard size="19" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
    );
  },
);

/**
 * ThinkingLabel - Non-interactive variant of the ThinkingButton header row,
 * for reasoning that happened but whose text is not available to this view
 * (detached subagent projections retain only a marker). Keeps the reasoning
 * presentation identical across surfaces without offering an empty disclosure.
 */
export const ThinkingLabel = memo(({ label, title }: { label: string; title?: string }) => {
  const fontSize = useAtomValue(fontSizeAtom);
  return (
    <div className="mb-2 pb-2 pt-2">
      <div
        className={cn('flex w-full items-center justify-start leading-[18px]', fontSize)}
        title={title}
      >
        <span className="relative mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center">
          <Lightbulb className="icon-sm text-text-secondary" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-left text-text-secondary">{label}</span>
      </div>
    </div>
  );
});

/**
 * FloatingThinkingBar - Floating bar with expand/collapse and copy buttons
 * Shows on hover/focus, positioned at bottom right of thinking content
 * Inspired by CodeBlock's FloatingCodeBar pattern
 */
export const FloatingThinkingBar = memo(
  ({
    isVisible,
    isExpanded,
    onClick,
    content,
    contentId,
  }: {
    isVisible: boolean;
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    content?: string;
    contentId: string;
  }) => {
    const localize = useLocalize();
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (content) {
          navigator.clipboard.writeText(content);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }
      },
      [content],
    );

    const collapseTooltip = isExpanded
      ? localize('com_ui_collapse_thoughts')
      : localize('com_ui_expand_thoughts');

    const copyTooltip = isCopied
      ? localize('com_ui_copied_to_clipboard')
      : localize('com_ui_copy_thoughts_to_clipboard');

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
              aria-expanded={isExpanded}
              aria-controls={contentId}
              className={cn(
                'flex items-center justify-center rounded p-1.5 text-text-tertiary',
                'hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
              )}
            >
              {isExpanded ? (
                <ChevronUp className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
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
                onClick={handleCopy}
                aria-label={copyTooltip}
                className={cn(
                  'flex items-center justify-center rounded p-1.5 text-text-tertiary',
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

/**
 * Thinking Component (LEGACY SYSTEM)
 *
 * Used for simple text-based messages with `:::thinking:::` markers.
 * This handles the old message format where text contains embedded thinking blocks.
 *
 * Pattern: `:::thinking\n{content}\n:::\n{response}`
 *
 * Used by:
 * - MessageContent.tsx for plain text messages
 * - Legacy message format compatibility
 * - User messages when manually adding thinking content
 *
 * For modern structured content (agents/assistants), see Reasoning.tsx component.
 */
const Thinking: React.ElementType = memo(({ children }: { children: React.ReactNode }) => {
  const localize = useLocalize();
  const showThinking = useAtomValue(showThinkingAtom);
  const [isExpanded, setIsExpanded] = useState(showThinking);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleFocus = useCallback(() => {
    setIsBarVisible(true);
  }, []);

  const handleBlur = useCallback((e: FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsBarVisible(false);
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsBarVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!containerRef.current?.contains(document.activeElement)) {
      setIsBarVisible(false);
    }
  }, []);

  const label = useMemo(() => localize('com_ui_thoughts'), [localize]);

  // Extract text content for copy functionality
  const textContent = useMemo(() => {
    if (typeof children === 'string') {
      return children;
    }
    return '';
  }, [children]);

  if (children == null) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="group/thinking-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div className="mb-4 pb-2 pt-2">
        <ThinkingButton
          isExpanded={isExpanded}
          onClick={handleClick}
          label={label}
          content={textContent}
          contentId={contentId}
        />
      </div>
      <div
        id={contentId}
        role="group"
        aria-label={label}
        aria-hidden={!isExpanded || undefined}
        className={cn(isExpanded && 'mb-8')}
        style={expandStyle}
      >
        <div className="relative overflow-hidden" ref={expandRef}>
          <ThinkingContent>{children}</ThinkingContent>
          <FloatingThinkingBar
            isVisible={isBarVisible && isExpanded}
            isExpanded={isExpanded}
            onClick={handleClick}
            content={textContent}
            contentId={contentId}
          />
        </div>
      </div>
    </div>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
ThinkingLabel.displayName = 'ThinkingLabel';
FloatingThinkingBar.displayName = 'FloatingThinkingBar';
Thinking.displayName = 'Thinking';

export default Thinking;
