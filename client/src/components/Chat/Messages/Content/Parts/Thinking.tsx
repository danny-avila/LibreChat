import {
  useState,
  useMemo,
  memo,
  useEffect,
  useCallback,
  useRef,
  useId,
  type MouseEvent,
} from 'react';
import { useAtomValue } from 'jotai';
import { TooltipAnchor } from '@librechat/client';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import type { FocusEvent, FC } from 'react';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { showThinkingAtom } from '~/store/showThinking';
import { fontSizeAtom } from '~/store/fontSize';
import { cn } from '~/utils';

/**
 * Tracks whether the referenced element is within the viewport. Mirrors the
 * CodeBlock pattern: the header copy/collapse controls live at the top, and the
 * floating bottom-right bar only takes over once the header scrolls out of view.
 */
export function useInViewport(): {
  ref: React.RefObject<HTMLDivElement>;
  inViewport: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), {
      root: null,
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inViewport };
}

/**
 * ThinkingContent - Displays the actual thinking/reasoning content
 * Used by both legacy text-based messages and modern content parts
 */
export const ThinkingContent: FC<{
  children: React.ReactNode;
}> = memo(({ children }) => {
  const fontSize = useAtomValue(fontSizeAtom);

  return (
    <div className="relative rounded-lg border border-border-light bg-surface-secondary p-3 pb-8 text-text-secondary">
      <p className={cn('whitespace-pre-wrap leading-[26px]', fontSize)}>{children}</p>
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
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
    content?: string;
    contentId: string;
    showCopyButton?: boolean;
  }) => {
    const localize = useLocalize();
    const fontSize = useAtomValue(fontSizeAtom);

    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = useCallback(() => {
      if (content) {
        navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    }, [content]);

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
          {label}
        </button>
        {content && showCopyButton && isExpanded && (
          <CopyButton
            isCopied={isCopied}
            iconOnly
            onClick={handleCopy}
            label={localize('com_ui_copy_thoughts_to_clipboard')}
            copiedLabel={localize('com_ui_copied_to_clipboard')}
            className={cn(
              'opacity-0 transition-opacity',
              'group-focus-within/thinking-container:opacity-100 group-hover/thinking-container:opacity-100',
              'focus-visible:opacity-100',
            )}
          />
        )}
      </div>
    );
  },
);

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

    const handleCopy = useCallback(() => {
      if (content) {
        navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    }, [content]);

    const collapseTooltip = isExpanded
      ? localize('com_ui_collapse_thoughts')
      : localize('com_ui_expand_thoughts');

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
                'flex items-center justify-center rounded-lg p-1.5 text-text-secondary',
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
          <CopyButton
            isCopied={isCopied}
            iconOnly
            tabIndex={isVisible ? 0 : -1}
            onClick={handleCopy}
            label={localize('com_ui_copy_thoughts_to_clipboard')}
            copiedLabel={localize('com_ui_copied_to_clipboard')}
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
  const { ref: headerRef, inViewport: headerInViewport } = useInViewport();
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
      <div className="mb-4 pb-2 pt-2" ref={headerRef}>
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
        style={expandStyle}
      >
        {/** Trailing gap lives inside the animated grid track (padding), not as
         *   an expand-only margin on the grid container, so it grows with the
         *   height instead of snapping in and jumping the content below. */}
        <div className="overflow-hidden pb-8" ref={expandRef}>
          <div className="relative">
            <ThinkingContent>{children}</ThinkingContent>
            <FloatingThinkingBar
              isVisible={isBarVisible && isExpanded && !headerInViewport}
              isExpanded={isExpanded}
              onClick={handleClick}
              content={textContent}
              contentId={contentId}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
FloatingThinkingBar.displayName = 'FloatingThinkingBar';
Thinking.displayName = 'Thinking';

export default Thinking;
