import { Fragment, Suspense } from 'react';
import type { TMessage, TResPlugin } from 'librechat-data-provider';
import type { TMessageContentProps, TDisplayProps } from '~/common';
import Plugin from '~/components/Messages/Content/Plugin';
import Error from '~/components/Messages/Content/Error';
import { DelayedRender } from '~/components/ui';
import EditMessage from './EditMessage';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';

export const ErrorMessage = ({
  text,
  message,
  className = '',
}: Pick<TDisplayProps, 'text' | 'className' | 'message'>) => {
  return (
    <Container message={message}>
      <div
        // TODO: Update tailwind.config.js and styles.css to match OpenAI's new color scheme, and update all reference of those colors to updated ones
        className={cn(
          'mt-0 flex w-full items-start gap-3 rounded-2xl border border-[#ffdbda] dark:border-[#4C2727] dark:bg-[#2D2322] bg-red-300/10 bg-opacity-5 p-4 text-sm',
          className,
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          className="icon-lg shrink-0 text-[#f93a37]"
          // shrink-0 looks off
        >
          <path
            fill="currentColor"
            d="M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0zM12 9.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5"
          ></path>
          <path
            fill="currentColor"
            fill-rule="evenodd"
            d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0"
            clip-rule="evenodd"
          ></path>
        </svg>
        <div className="pt-px">
          <div className="markdown prose dark:prose-invert w-full break-words">
            <Error text={text} />
          </div>
        </div>
      </div>
    </Container>
  );
};

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser, message, showCursor }: TDisplayProps) => {
  return (
    <Container message={message}>
      <div
        className={cn(
          showCursor && !!text?.length ? 'result-streaming' : '',
          'markdown prose dark:prose-invert light w-full break-words',
          isCreatedByUser ? 'whitespace-pre-wrap dark:text-gray-20' : 'dark:text-gray-100',
        )}
      >
        {!isCreatedByUser ? (
          <Markdown content={text} message={message} showCursor={showCursor} />
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
