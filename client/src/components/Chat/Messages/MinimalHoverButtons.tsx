import { useState, useMemo } from 'react';
import { Button, Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import type { TMessage, SearchResultData } from 'librechat-data-provider';
import { useLocalize, useCopyToClipboard, hasCopyableText } from '~/hooks';
import { revealOnRowHoverClasses } from './styles';
import { cn } from '~/utils';

type THoverButtons = {
  message: TMessage;
  searchResults?: { [key: string]: SearchResultData };
};

export default function MinimalHoverButtons({ message, searchResults }: THoverButtons) {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  const copyToClipboard = useCopyToClipboard({
    text: message.text,
    content: message.content,
    searchResults,
  });
  const canCopy = useMemo(
    () => hasCopyableText({ text: message.text, content: message.content, searchResults }),
    [message.text, message.content, searchResults],
  );

  return (
    <div className="visible mt-1 flex justify-center gap-1 self-end text-text-tertiary lg:justify-start">
      <TooltipAnchor
        description={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              isCopied
                ? localize('com_ui_copied_to_clipboard')
                : localize('com_ui_copy_to_clipboard')
            }
            className={cn(
              'ml-0 flex size-auto items-center gap-1.5 rounded-lg p-1.5 text-xs text-text-secondary-alt',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
              revealOnRowHoverClasses,
            )}
            disabled={!canCopy}
            onClick={() => copyToClipboard(setIsCopied)}
          >
            {isCopied ? (
              <CheckMark className="h-[1.1875rem] w-[1.1875rem]" />
            ) : (
              <Clipboard className="h-[1.1875rem] w-[1.1875rem]" />
            )}
          </Button>
        }
      />
    </div>
  );
}
