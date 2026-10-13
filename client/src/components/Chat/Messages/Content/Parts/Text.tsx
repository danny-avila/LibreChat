import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import {
  applyBklAnswerHyperlinks,
  useBklAnswerHyperlinks,
} from '~/components/Chat/Messages/Content/useBklAnswerHyperlinks';
import { useMessageContext } from '~/Providers';
import { cn, getBklDisplayText } from '~/utils';
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

const TextPart = memo(function TextPart({ text, isCreatedByUser, showCursor }: TextPartProps) {
  const { messageId, isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  // agents/resumable 경로의 답변은 MessageContent 가 아니라 이 컴포넌트로
  // 렌더된다 — "검색 문서 리스트" 『파일명』 링크 치환을 여기서도 적용한다.
  const hyperlinks = useBklAnswerHyperlinks(messageId, text, undefined, !isCreatedByUser);
  const displayText = useMemo(() => {
    const stripped = getBklDisplayText(text);
    return isCreatedByUser ? stripped : applyBklAnswerHyperlinks(stripped, hyperlinks);
  }, [text, isCreatedByUser, hyperlinks]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={displayText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={displayText} />;
    } else {
      return <>{displayText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, displayText, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!displayText.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
    </div>
  );
});
TextPart.displayName = 'TextPart';

export default TextPart;
