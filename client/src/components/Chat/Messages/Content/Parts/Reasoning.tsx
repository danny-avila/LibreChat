import { memo, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { ThinkingContent } from '~/components/Artifacts/Thinking';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';

type ReasoningProps = {
  reasoning: string;
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
 * - Uses shared ThinkingButton via ContentParts.tsx
 * - Controlled by MessageContext isExpanded state
 *
 * For legacy text-based messages, see Thinking.tsx component.
 */
const Reasoning = memo(({ reasoning }: ReasoningProps) => {
  const { isExpanded, nextType } = useMessageContext();

  // Strip <think> tags from the reasoning content (modern format)
  const reasoningText = useMemo(() => {
    return reasoning
      .replace(/^<think>\s*/, '')
      .replace(/\s*<\/think>$/, '')
      .trim();
  }, [reasoning]);

  if (!reasoningText) {
    return null;
  }

  // Note: The toggle button is rendered separately in ContentParts.tsx
  // This component only handles the collapsible content area
  return (
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
  );
});

export default Reasoning;
