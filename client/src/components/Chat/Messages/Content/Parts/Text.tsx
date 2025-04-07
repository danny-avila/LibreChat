import { memo, useMemo, ReactElement, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useChatContext, useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { messageId } = useMessageContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (!isSubmitting || !showCursor || charCount >= text.length) {
      return;
    }

    let animationFrameId: number;
    const MIN_INCREMENT = 4;
    const MAX_INCREMENT = 50;
    const ANIMATION_DURATION_MS = 100; // Target duration for full text
    const FRAME_RATE = 100; // Assuming 60fps

    const calculateDynamicIncrement = () => {
      // Calculate remaining characters
      const remainingChars = text.length - charCount;
      if (remainingChars <= 0) return 0;

      // Calculate remaining frames based on target duration
      const remainingFrames = Math.ceil((ANIMATION_DURATION_MS / 1000) * FRAME_RATE);
      
      // Calculate ideal increment to complete in target duration
      const idealIncrement = Math.ceil(remainingChars / remainingFrames);
      
      // Clamp increment between min and max values
      return Math.min(MAX_INCREMENT, Math.max(MIN_INCREMENT, idealIncrement));
    };

    const animate = () => {
      if (charCount >= text.length) {
        return;
      }

      const dynamicIncrement = calculateDynamicIncrement();
      setCharCount(prev => Math.min(prev + dynamicIncrement, text.length));
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isSubmitting, showCursor, text.length, charCount]);

  const displayText = text.substring(0, charCount);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={displayText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={displayText} />;
    } else {
      return <>{displayText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, displayText, showCursorState, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
    </div>
  );
});

export default TextPart;
