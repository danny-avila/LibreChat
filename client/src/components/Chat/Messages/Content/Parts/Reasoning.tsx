import { memo, useMemo, useState, useEffect, useCallback, useRef, useId } from 'react';
import { useAtomValue } from 'jotai';
import { Lightbulb, ChevronDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { MouseEvent, FocusEvent } from 'react';
import { ThinkingContent, ThinkingButton, FloatingThinkingBar, useInViewport } from './Thinking';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { showThinkingAtom } from '~/store/showThinking';
import { fontSizeAtom } from '~/store/fontSize';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';

const stripThinkTags = (reasoning: string): string =>
  reasoning
    .replace(/^<think>\s*/, '')
    .replace(/\s*<\/think>$/, '')
    .trim();

const PEEK_SENTENCES = 4;

/** Tail of streaming reasoning — the last few sentences — for the collapsed
 *  live peek. Bounds work on long reasoning by scanning only the trailing
 *  slice before splitting on sentence boundaries. */
const lastSentences = (text: string): string => {
  const tail = text.trim().slice(-1200);
  if (!tail) {
    return '';
  }
  const sentences = tail.split(/(?<=[.!?])\s+/);
  return sentences.slice(-PEEK_SENTENCES).join(' ').trim();
};

/** Symmetric top + bottom edge fade so streaming text dissolves in at the
 *  bottom and out at the top, framed by the same rounded outline the expanded
 *  panel uses. */
const PEEK_FADE =
  'linear-gradient(to bottom, transparent, #000 1.25rem, #000 calc(100% - 1.25rem), transparent)';

/**
 * Collapsed live preview of streaming reasoning. Mirrors the expanded thought
 * panel — same rounded outline and text treatment — but with a border instead
 * of a surface fill, showing the trailing few sentences in a short,
 * bottom-pinned window whose top and bottom edges fade out, so the newest
 * thought stays in view while older lines scroll up and dissolve (the "thinking
 * out loud" treatment popularized by Grok). Decorative only (aria-hidden); the
 * toggle button above it provides the accessible control.
 */
const StreamingThoughtPeek = memo(({ text }: { text: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const fontSize = useAtomValue(fontSizeAtom);
  const peek = useMemo(() => lastSentences(text), [text]);

  /** Pin to the newest content as tokens arrive. `overflow-hidden` elements
   *  are still scrollable programmatically, so the tail stays in view without
   *  exposing a scrollbar. */
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [peek]);

  if (!peek) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="mt-1 overflow-hidden rounded-2xl border border-border-light px-4 py-3"
    >
      <div
        ref={ref}
        className={cn(
          /** Fixed-height window the text scrolls through. The one-line top pad
           *  keeps the first streaming line below the top fade (a blank line
           *  above it) instead of jammed against the faded edge. */
          'h-[5.5rem] overflow-hidden whitespace-pre-wrap break-words pt-[26px] leading-[26px] text-text-primary',
          fontSize,
        )}
        style={{ maskImage: PEEK_FADE, WebkitMaskImage: PEEK_FADE }}
      >
        {peek}
      </div>
    </div>
  );
});

StreamingThoughtPeek.displayName = 'StreamingThoughtPeek';

type ReasoningProps = {
  reasoning: string;
  isLast: boolean;
};

/**
 * Reasoning Component (MODERN SYSTEM)
 *
 * Used for structured content parts with ContentTypes.THINK type.
 * This handles modern message format where content is an array of typed parts.
 *
 * Pattern: `{ content: [{ type: "think", think: "<think>content</think>" }, ...] }`
 *
 * Used by:
 * - ContentParts.tsx → Part.tsx for structured messages
 * - Agent/Assistant responses (OpenAI Assistants, custom agents)
 * - O-series models (o1, o3) with reasoning capabilities
 * - Modern Claude responses with thinking blocks
 *
 * Key differences from legacy Thinking.tsx:
 * - Works with content parts array instead of plain text
 * - Strips `<think>` tags instead of `:::thinking:::` markers
 * - Each THINK part has its own independent toggle button
 * - Can be interleaved with other content types
 *
 * For legacy text-based messages, see Thinking.tsx component.
 */
const Reasoning = memo(({ reasoning, isLast }: ReasoningProps) => {
  const contentId = useId();
  const localize = useLocalize();
  const showThinking = useAtomValue(showThinkingAtom);
  const [isExpanded, setIsExpanded] = useState(showThinking);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: headerRef, inViewport: headerInViewport } = useInViewport();
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);
  const { isSubmitting, isLatestMessage, nextType } = useMessageContext();

  // Strip <think> tags from the reasoning content (modern format)
  const reasoningText = useMemo(() => stripThinkTags(reasoning), [reasoning]);

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

  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  const label = useMemo(
    () =>
      effectiveIsSubmitting && isLast ? localize('com_ui_thinking') : localize('com_ui_thoughts'),
    [effectiveIsSubmitting, localize, isLast],
  );

  if (!reasoningText) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="group/reasoning"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div className="group/thinking-container">
        <div className="mb-2 pb-2 pt-2" ref={headerRef}>
          <ThinkingButton
            isExpanded={isExpanded}
            onClick={handleClick}
            label={label}
            content={reasoningText}
            contentId={contentId}
          />
          {!isExpanded && effectiveIsSubmitting && isLast && (
            <StreamingThoughtPeek text={reasoningText} />
          )}
        </div>
        <div
          id={contentId}
          role="group"
          aria-label={label}
          aria-hidden={!isExpanded || undefined}
          style={expandStyle}
        >
          {/** Trailing gap before the next content lives INSIDE the animated
           *   grid track (as padding), not as an expand-only margin on the grid
           *   container — otherwise it snaps in/out instantly while the height
           *   animates, jumping the content below. Only when the next part isn't
           *   another thought (consecutive thoughts stay tight). */}
          <div
            className={cn('overflow-hidden', nextType !== ContentTypes.THINK && 'pb-4')}
            ref={expandRef}
          >
            <div className="relative">
              <ThinkingContent>{reasoningText}</ThinkingContent>
              <FloatingThinkingBar
                isVisible={isBarVisible && isExpanded && !headerInViewport}
                isExpanded={isExpanded}
                onClick={handleClick}
                content={reasoningText}
                contentId={contentId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

Reasoning.displayName = 'Reasoning';

type ReasoningCompactProps = {
  reasoning: string;
  label: string;
  /** True while this is the reasoning part currently streaming. Drives the
   *  collapsed grok-style live peek. */
  isStreaming?: boolean;
};

/**
 * Compact reasoning row for use INSIDE a ToolCallGroup. Keeps the tool-row
 * header rhythm (icon + label + chevron) so an interleaved thought reads as a
 * sibling of the surrounding tool calls, while retaining the standalone
 * {@link Reasoning} affordances — a hover-revealed copy button on the header and
 * a floating collapse + copy bar inside the rounded content panel.
 */
export const ReasoningCompact = memo(
  ({ reasoning, label, isStreaming = false }: ReasoningCompactProps) => {
    const contentId = useId();
    const localize = useLocalize();
    const fontSize = useAtomValue(fontSizeAtom);
    const showThinking = useAtomValue(showThinkingAtom);
    const [isExpanded, setIsExpanded] = useState(showThinking);
    const [isBarVisible, setIsBarVisible] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { ref: headerRef, inViewport: headerInViewport } = useInViewport();
    const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);

    const reasoningText = useMemo(() => stripThinkTags(reasoning), [reasoning]);

    const handleToggle = useCallback((e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsExpanded((prev) => !prev);
    }, []);

    const handleCopy = useCallback(() => {
      navigator.clipboard.writeText(reasoningText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }, [reasoningText]);

    const revealBar = useCallback(() => setIsBarVisible(true), []);
    const hideBar = useCallback(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsBarVisible(false);
      }
    }, []);
    const handleBlur = useCallback((e: FocusEvent) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setIsBarVisible(false);
      }
    }, []);

    if (!reasoningText) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        className="group/reasoning-compact"
        onMouseEnter={revealBar}
        onMouseLeave={hideBar}
        onFocus={revealBar}
        onBlur={handleBlur}
      >
        <div ref={headerRef} className="relative my-1.5 flex h-5 shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className="inline-flex min-w-0 flex-1 items-center gap-2 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
          >
            <Lightbulb className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="tool-status-text font-medium">{label}</span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 translate-y-[1px] text-text-secondary transition-transform duration-200 ease-out',
                isExpanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
          {isExpanded && (
            <CopyButton
              isCopied={isCopied}
              iconOnly
              onClick={handleCopy}
              label={localize('com_ui_copy_thoughts_to_clipboard')}
              copiedLabel={localize('com_ui_copied_to_clipboard')}
              className={cn(
                'shrink-0 opacity-0 transition-opacity',
                'group-focus-within/reasoning-compact:opacity-100 group-hover/reasoning-compact:opacity-100',
                'focus-visible:opacity-100',
              )}
            />
          )}
        </div>
        {!isExpanded && isStreaming && <StreamingThoughtPeek text={reasoningText} />}
        <div
          id={contentId}
          role="group"
          aria-label={label}
          aria-hidden={!isExpanded || undefined}
          style={expandStyle}
        >
          <div className="overflow-hidden" ref={expandRef}>
            <div className="relative my-2 rounded-2xl border border-border-light bg-surface-secondary p-4 pb-9 text-text-secondary">
              <p className={cn('whitespace-pre-wrap leading-[26px]', fontSize)}>{reasoningText}</p>
              <FloatingThinkingBar
                isVisible={isBarVisible && isExpanded && !headerInViewport}
                isExpanded={isExpanded}
                onClick={handleToggle}
                content={reasoningText}
                contentId={contentId}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

ReasoningCompact.displayName = 'ReasoningCompact';

export default Reasoning;
