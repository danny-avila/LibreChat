import { useState, useMemo, memo, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { Lightbulb, ChevronDown } from 'lucide-react';
import { Clipboard, CheckMark } from '@librechat/client';
import type { MouseEvent, FC } from 'react';
import { showThinkingAtom } from '~/store/showThinking';
import { fontSizeAtom } from '~/store/fontSize';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * ThinkingContent - Displays the actual thinking/reasoning content
 * Used by both legacy text-based messages and modern content parts
 */
export const ThinkingContent: FC<{
  children: React.ReactNode;
}> = memo(({ children }) => {
  const fontSize = useAtomValue(fontSizeAtom);

  return (
    <div className="relative rounded-3xl border border-border-medium bg-surface-tertiary p-4 text-text-secondary">
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
    isContentHovered = false,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
    content?: string;
    isContentHovered?: boolean;
  }) => {
    const localize = useLocalize();
    const fontSize = useAtomValue(fontSizeAtom);

    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const isHovered = useMemo(
      () => isButtonHovered || isContentHovered,
      [isButtonHovered, isContentHovered],
    );

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
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClick}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
          className={cn(
            'group flex flex-1 items-center justify-start rounded-lg leading-[18px]',
            fontSize,
          )}
        >
          {isHovered ? (
            <ChevronDown
              className={cn(
                'icon-sm mr-1.5 transform-gpu text-text-primary transition-transform duration-300',
                isExpanded && 'rotate-180',
              )}
            />
          ) : (
            <Lightbulb className="icon-sm mr-1.5 text-text-secondary" />
          )}
          {label}
        </button>
        {content && (
          <button
            type="button"
            onClick={handleCopy}
            title={
              isCopied
                ? localize('com_ui_copied_to_clipboard')
                : localize('com_ui_copy_thoughts_to_clipboard')
            }
            className={cn(
              'rounded-lg p-1.5 text-text-secondary-alt transition-colors duration-200',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',
            )}
          >
            {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
          </button>
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
  const [isContentHovered, setIsContentHovered] = useState(false);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleContentEnter = useCallback(() => setIsContentHovered(true), []);
  const handleContentLeave = useCallback(() => setIsContentHovered(false), []);

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
    <div onMouseEnter={handleContentEnter} onMouseLeave={handleContentLeave}>
      <div className="sticky top-0 z-10 mb-4 bg-surface-primary pb-2 pt-2">
        <ThinkingButton
          isExpanded={isExpanded}
          onClick={handleClick}
          label={label}
          content={textContent}
          isContentHovered={isContentHovered}
        />
      </div>
      <div
        className={cn('grid transition-all duration-300 ease-out', isExpanded && 'mb-8')}
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <ThinkingContent>{children}</ThinkingContent>
        </div>
      </div>
    </div>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
Thinking.displayName = 'Thinking';

export default memo(Thinking);
