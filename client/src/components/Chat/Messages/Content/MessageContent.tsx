import { Fragment, Suspense, useMemo } from 'react';
import type { TMessage, TResPlugin } from 'librechat-data-provider';
import type { TMessageContentProps, TDisplayProps } from '~/common';
import Plugin from '~/components/Messages/Content/Plugin';
import Error from '~/components/Messages/Content/Error';
import { DelayedRender } from '~/components/ui';
import { useChatContext } from '~/Providers';
import EditMessage from './EditMessage';
import { useLocalize } from '~/hooks';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';

export const ErrorMessage = ({
  text,
  message,
  className = '',
}: Pick<TDisplayProps, 'text' | 'className' | 'message'>) => {
  const localize = useLocalize();
  if (text === 'Error connecting to server, try refreshing the page.') {
    console.log('error message', message);
    return (
      <Suspense
        fallback={
          <div className="text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-x-auto">
            <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
              <div className="absolute">
                <p className="submitting relative">
                  <span className="result-thinking" />
                </p>
              </div>
            </div>
          </div>
        }
      >
        <DelayedRender delay={5500}>
          <Container message={message}>
            <div
              className={cn(
                'rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200',
                className,
              )}
            >
              {localize('com_ui_error_connection')}
            </div>
          </Container>
        </DelayedRender>
      </Suspense>
    );
  }
  return (
    <Container message={message}>
      <div
        className={cn(
          'rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200',
          className,
        )}
      >
        <Error text={text} />
      </div>
    </Container>
  );
};

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser, message, showCursor }: TDisplayProps) => {
  const { isSubmitting, latestMessage } = useChatContext();
  const showCursorState = useMemo(
    () => showCursor === true && isSubmitting,
    [showCursor, isSubmitting],
  );
  const isLatestMessage = useMemo(
    () => message.messageId === latestMessage?.messageId,
    [message.messageId, latestMessage?.messageId],
  );
  return (
    <Container message={message}>
      <div
        className={cn(
          isSubmitting ? 'submitting' : '',
          showCursorState && !!text.length ? 'result-streaming' : '',
          'markdown prose message-content dark:prose-invert light w-full break-words',
          isCreatedByUser ? 'whitespace-pre-wrap dark:text-gray-20' : 'dark:text-gray-100',
        )}
      >
        {!isCreatedByUser ? (
          <Markdown
            content={text}
            isEdited={message.isEdited}
            showCursor={showCursorState}
            isLatestMessage={isLatestMessage}
          />
        ) : (
          <>{text}</>
        )}
      </div>
    </Container>
  );
};

// Unfinished Message Component
export const UnfinishedMessage = ({ message }: { message: TMessage }) => (
  <ErrorMessage
    message={message}
    text="The response is incomplete; it's either still processing, was cancelled, or censored. Refresh or try a different prompt."
  />
);

// Content Component
const MessageContent = ({
  text,
  edit,
  error,
  unfinished,
  isSubmitting,
  isLast,
  ...props
}: TMessageContentProps) => {
  if (error) {
    return <ErrorMessage message={props.message} text={text} />;
  } else if (edit) {
    return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  } else {
    const marker = ':::plugin:::\n';
    const splitText = text.split(marker);
    const { message } = props;
    const { plugins, messageId } = message;
    const displayedIndices = new Set<number>();
    // Function to get the next non-empty text index
    const getNextNonEmptyTextIndex = (currentIndex: number) => {
      for (let i = currentIndex + 1; i < splitText.length; i++) {
        // Allow the last index to be last in case it has text
        // this may need to change if I add back streaming
        if (i === splitText.length - 1) {
          return currentIndex;
        }

        if (splitText[i].trim() !== '' && !displayedIndices.has(i)) {
          return i;
        }
      }
      return currentIndex; // If no non-empty text is found, return the current index
    };

    return splitText.map((text, idx) => {
      let currentText = text.trim();
      let plugin: TResPlugin | null = null;

      if (plugins) {
        plugin = plugins[idx];
      }

      // If the current text is empty, get the next non-empty text index
      const displayTextIndex = currentText === '' ? getNextNonEmptyTextIndex(idx) : idx;
      currentText = splitText[displayTextIndex];
      const isLastIndex = displayTextIndex === splitText.length - 1;
      const isEmpty = currentText.trim() === '';
      const showText =
        (currentText && !isEmpty && !displayedIndices.has(displayTextIndex)) ||
        (isEmpty && isLastIndex);
      displayedIndices.add(displayTextIndex);

      return (
        <Fragment key={idx}>
          {plugin && <Plugin key={`plugin-${messageId}-${idx}`} plugin={plugin} />}
          {showText ? (
            <DisplayMessage
              key={`display-${messageId}-${idx}`}
              showCursor={isLastIndex && isLast && isSubmitting}
              text={currentText}
              {...props}
            />
          ) : null}
          {!isSubmitting && unfinished && (
            <Suspense>
              <DelayedRender delay={250}>
                <UnfinishedMessage message={message} key={`unfinished-${messageId}-${idx}`} />
              </DelayedRender>
            </Suspense>
          )}
        </Fragment>
      );
    });
  }
};

export default MessageContent;
