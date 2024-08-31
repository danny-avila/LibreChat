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
import { cn } from '~/utils';
import Image from './Image';

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

  // Note: for testing purposes
  // isSubmitting && isLatestMessage && logger.log('message_stream', { text, isCreatedByUser, isSubmitting, showCursorState });

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
  part: TMessageContentParts | undefined;
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
    const text = typeof part.text === 'string' ? part.text : part.text.value;
    if (typeof text !== 'string') {
      return null;
    }
    return (
      <Container message={message}>
        <DisplayMessage
          text={text}
          isCreatedByUser={message.isCreatedByUser}
          message={message}
          showCursor={showCursor}
        />
      </Container>
    );
  } else if (part.type === ContentTypes.TOOL_CALL) {
    const toolCall = part[ContentTypes.TOOL_CALL];

    if (!toolCall) {
      return null;
    }

    if ('args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL)) {
      return (
        <ToolCall
          args={toolCall.args}
          name={toolCall.name ?? ''}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
        />
      );
    } else if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
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
      toolCall.type === ToolCallTypes.RETRIEVAL ||
      toolCall.type === ToolCallTypes.FILE_SEARCH
    ) {
      return (
        <RetrievalCall initialProgress={toolCall.progress ?? 0.1} isSubmitting={isSubmitting} />
      );
    } else if (
      toolCall.type === ToolCallTypes.FUNCTION &&
      ToolCallTypes.FUNCTION in toolCall &&
      imageGenTools.has(toolCall.function.name)
    ) {
      return (
        <ImageGen
          initialProgress={toolCall.progress ?? 0.1}
          args={toolCall.function.arguments as string}
        />
      );
    } else if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
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
          args={toolCall.function.arguments as string}
          name={toolCall.function.name}
          output={toolCall.function.output}
        />
      );
    }
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
      />
    );
  }

  return null;
}
