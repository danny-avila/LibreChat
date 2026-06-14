import { memo, useMemo, useState, useCallback, useRef, useId } from 'react';
import { useAtomValue } from 'jotai';
import { Lightbulb, ChevronDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import { Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import type { MouseEvent, FocusEvent } from 'react';
import { ThinkingContent, ThinkingButton, FloatingThinkingBar } from './Thinking';
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
        <div className="mb-2 pb-2 pt-2">
          <ThinkingButton
            isExpanded={isExpanded}
            onClick={handleClick}
            label={label}
            content={reasoningText}
            contentId={contentId}
          />
        </div>
        <div
          id={contentId}
          role="group"
          aria-label={label}
          aria-hidden={!isExpanded || undefined}
          className={cn(nextType !== ContentTypes.THINK && isExpanded && 'mb-4')}
          style={expandStyle}
        >
          <div className="relative overflow-hidden" ref={expandRef}>
            <ThinkingContent>{reasoningText}</ThinkingContent>
            <FloatingThinkingBar
              isVisible={isBarVisible && isExpanded}
              isExpanded={isExpanded}
              onClick={handleClick}
              content={reasoningText}
              contentId={contentId}
            />
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
};

/**
 * Compact reasoning row for use INSIDE a ToolCallGroup. Keeps the tool-row
 * header rhythm (icon + label + chevron) so an interleaved thought reads as a
 * sibling of the surrounding tool calls, while retaining the standalone
 * {@link Reasoning} affordances — a hover-revealed copy button on the header and
 * a floating collapse + copy bar inside the rounded content panel.
 */
export const ReasoningCompact = memo(({ reasoning, label }: ReasoningCompactProps) => {
  const contentId = useId();
  const localize = useLocalize();
  const fontSize = useAtomValue(fontSizeAtom);
  const showThinking = useAtomValue(showThinkingAtom);
  const [isExpanded, setIsExpanded] = useState(showThinking);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);

  const reasoningText = useMemo(() => stripThinkTags(reasoning), [reasoning]);

  const handleToggle = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleCopy = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      navigator.clipboard.writeText(reasoningText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    },
    [reasoningText],
  );

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

  const copyLabel = isCopied
    ? localize('com_ui_copied_to_clipboard')
    : localize('com_ui_copy_thoughts_to_clipboard');

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
      <div className="relative my-1.5 flex h-5 shrink-0 items-center gap-1.5">
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
        <TooltipAnchor
          description={copyLabel}
          render={
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copyLabel}
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg p-1 text-text-tertiary transition-opacity duration-150',
                'opacity-0 group-focus-within/reasoning-compact:opacity-100 group-hover/reasoning-compact:opacity-100',
                'hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
              )}
            >
              {isCopied ? (
                <CheckMark className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Clipboard size="16" aria-hidden="true" />
              )}
            </button>
          }
        />
      </div>
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
              isVisible={isBarVisible && isExpanded}
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
});

ReasoningCompact.displayName = 'ReasoningCompact';

export default Reasoning;
