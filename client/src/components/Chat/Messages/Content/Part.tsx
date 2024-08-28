import {
  ToolCallTypes,
  ContentTypes,
  imageGenTools,
  isImageVisionTool,
} from 'librechat-data-provider';
import { useMemo } from 'react';
import type { TMessageContentParts, TMessage } from 'librechat-data-provider';
import type { TDisplayProps } from '~/common';
import { ErrorMessage } from './MessageContent';
import { useChatContext } from '~/Providers';
import RetrievalCall from './RetrievalCall';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import ToolCall from './ToolCall';
import Markdown from './Markdown';
import ImageGen from './ImageGen';
import Image from './Image';
import { cn } from '~/utils';

// import EditMessage from './EditMessage';

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser = false, message, showCursor }: TDisplayProps) => {
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
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser ? 'whitespace-pre-wrap dark:text-gray-20' : 'dark:text-gray-70',
      )}
    >
      {!isCreatedByUser ? (
        <Markdown content={text} showCursor={showCursorState} isLatestMessage={isLatestMessage} />
      ) : (
        <>{text}</>
      )}
    </div>
  );
};

export default function Part({
  part,
  showCursor,
  isSubmitting,
  message,
}: {
  part: TMessageContentParts;
  isSubmitting: boolean;
  showCursor: boolean;
  message: TMessage;
}) {
  if (!part) {
    return null;
  }

  if (part.type === ContentTypes.ERROR) {
    return <ErrorMessage message={message} text={part[ContentTypes.TEXT].value} className="my-2" />;
  } else if (part.type === ContentTypes.TEXT) {
    // Access the value property
    return (
      <Container message={message}>
        <DisplayMessage
          text={part[ContentTypes.TEXT].value}
          isCreatedByUser={message.isCreatedByUser}
          message={message}
          showCursor={showCursor}
        />
      </Container>
    );
  } else if (
    part.type === ContentTypes.TOOL_CALL &&
    part[ContentTypes.TOOL_CALL].type === ToolCallTypes.CODE_INTERPRETER
  ) {
    const toolCall = part[ContentTypes.TOOL_CALL];
    const code_interpreter = toolCall[ToolCallTypes.CODE_INTERPRETER];
    return (
      <CodeAnalyze
        initialProgress={toolCall.progress ?? 0.1}
        code={code_interpreter.input}
        outputs={code_interpreter.outputs ?? []}
        isSubmitting={isSubmitting}
      />
    );
  } else if (
    part.type === ContentTypes.TOOL_CALL &&
    (part[ContentTypes.TOOL_CALL].type === ToolCallTypes.RETRIEVAL ||
      part[ContentTypes.TOOL_CALL].type === ToolCallTypes.FILE_SEARCH)
  ) {
    const toolCall = part[ContentTypes.TOOL_CALL];
    return <RetrievalCall initialProgress={toolCall.progress ?? 0.1} isSubmitting={isSubmitting} />;
  } else if (
    part.type === ContentTypes.TOOL_CALL &&
    part[ContentTypes.TOOL_CALL].type === ToolCallTypes.FUNCTION &&
    imageGenTools.has(part[ContentTypes.TOOL_CALL].function.name)
  ) {
    const toolCall = part[ContentTypes.TOOL_CALL];
    return (
      <ImageGen initialProgress={toolCall.progress ?? 0.1} args={toolCall.function.arguments} />
    );
  } else if (
    part.type === ContentTypes.TOOL_CALL &&
    part[ContentTypes.TOOL_CALL].type === ToolCallTypes.FUNCTION
  ) {
    const toolCall = part[ContentTypes.TOOL_CALL];
    if (isImageVisionTool(toolCall)) {
      if (isSubmitting && showCursor) {
        return (
          <Container message={message}>
            <DisplayMessage
              text={''}
              isCreatedByUser={message.isCreatedByUser}
              message={message}
              showCursor={showCursor}
            />
          </Container>
        );
      }

      return null;
    }

    return (
      <ToolCall
        initialProgress={toolCall.progress ?? 0.1}
        isSubmitting={isSubmitting}
        args={toolCall.function.arguments}
        name={toolCall.function.name}
        output={toolCall.function.output}
      />
    );
  } else if (part.type === ContentTypes.IMAGE_FILE) {
    const imageFile = part[ContentTypes.IMAGE_FILE];
    const height = imageFile.height ?? 1920;
    const width = imageFile.width ?? 1080;
    return (
      <Image
        imagePath={imageFile.filepath}
        height={height}
        width={width}
        altText={imageFile.filename ?? 'Uploaded Image'}
        placeholderDimensions={{
          height: height + 'px',
          width: width + 'px',
        }}
        // n={imageFiles.length}
        // i={i}
      />
    );
  }

  return null;
}
