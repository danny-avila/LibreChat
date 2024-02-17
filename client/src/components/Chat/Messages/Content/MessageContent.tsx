import { Fragment, Suspense } from 'react';
import type { TResPlugin, TFile } from 'librechat-data-provider';
import type { TMessageContentProps, TText, TDisplayProps } from '~/common';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Plugin from '~/components/Messages/Content/Plugin';
import Error from '~/components/Messages/Content/Error';
import { DelayedRender } from '~/components/ui';
import { useAuthContext } from '~/hooks';
import EditMessage from './EditMessage';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';
import Image from './Image';

export const ErrorMessage = ({ text }: TText) => {
  const { logout } = useAuthContext();

  if (text.includes('ban')) {
    logout();
    return null;
  }
  return (
    <Container>
      <div className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-100">
        <Error text={text} />
      </div>
    </Container>
  );
};

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser, message, showCursor }: TDisplayProps) => {
  const files: TFile[] = [];
  const imageFiles = message?.files
    ? message.files.filter((file) => {
      if (file.type && file.type.startsWith('image/')) {
        return true;
      }

      files.push(file);
    })
    : null;
  return (
    <Container>
      {files.length > 0 && files.map((file) => <FileContainer key={file.file_id} file={file} />)}
      {imageFiles &&
        imageFiles.map((file) => (
          <Image
            key={file.file_id}
            imagePath={file?.preview ?? file.filepath ?? ''}
            height={file.height ?? 1920}
            width={file.width ?? 1080}
            altText={file.filename ?? 'Uploaded Image'}
            // n={imageFiles.length}
            // i={i}
          />
        ))}
      <div
        className={cn(
          showCursor && !!text?.length ? 'result-streaming' : '',
          'markdown prose dark:prose-invert light w-full break-words',
          isCreatedByUser ? 'whitespace-pre-wrap dark:text-gray-20' : 'dark:text-gray-70',
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
export const UnfinishedMessage = () => (
  <ErrorMessage text="The response is incomplete; it's either still processing, was cancelled, or censoreded. Refresh or try a different prompt." />
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
    return <ErrorMessage text={text} />;
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
                <UnfinishedMessage key={`unfinished-${messageId}-${idx}`} />
              </DelayedRender>
            </Suspense>
          )}
        </Fragment>
      );
    });
  }
};

export default MessageContent;
