import { memo, useMemo, useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import type { MouseEvent } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { ThinkingContent, ThinkingButton } from './Thinking';
import { showThinkingAtom } from '~/store/showThinking';
import { useMessageContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
  const localize = useLocalize();
  const [showThinking] = useAtom(showThinkingAtom);
  const [isExpanded, setIsExpanded] = useState(showThinking);
  const { isSubmitting, isLatestMessage, nextType } = useMessageContext();

  // Strip <think> tags from the reasoning content (modern format)
  const reasoningText = useMemo(() => {
    return reasoning
      .replace(/^<think>\s*/, '')
      .replace(/\s*<\/think>$/, '')
      .trim();
  }, [reasoning]);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
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
    <div className="group/reasoning">
      <div className="group/thinking-container">
        <div className="sticky top-0 z-10 mb-2 bg-presentation pb-2 pt-2">
          <ThinkingButton
            isExpanded={isExpanded}
            onClick={handleClick}
            label={label}
            content={reasoningText}
          />
        </div>
        <div
          className={cn(
            'grid transition-all duration-300 ease-out',
            nextType !== ContentTypes.THINK && isExpanded && 'mb-4',
          )}
          style={{
            gridTemplateRows: isExpanded ? '1fr' : '0fr',
          }}
        >
          <div className="overflow-hidden">
            <ThinkingContent>{reasoningText}</ThinkingContent>
          </div>
        </div>
      </div>
    </div>
  );
});

export default Reasoning;
