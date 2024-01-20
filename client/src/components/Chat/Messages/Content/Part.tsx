import { ToolCallTypes, ContentTypes, imageGenTools } from 'librechat-data-provider';
import type { TMessageContentParts, TMessage } from 'librechat-data-provider';
import type { TDisplayProps } from '~/common';
import CodeAnalyze from './CodeAnalyze';
import ActionCall from './ActionCall';
import Container from './Container';
import Markdown from './Markdown';
import ImageGen from './ImageGen';
import Image from './Image';
import { cn } from '~/utils';

// import EditMessage from './EditMessage';

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser = false, message, showCursor }: TDisplayProps) => {
  return (
    <div
      className={cn(
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
  );
};

export default function Part({
  part,
  showCursor,
  message,
}: {
  part: TMessageContentParts;
  showCursor: boolean;
  message: TMessage;
}) {
  if (!part) {
    return null;
  }
  if (part.type === ContentTypes.TEXT) {
    // Access the value property
    return (
      <Container>
        <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-70">
          <DisplayMessage
            text={part[ContentTypes.TEXT].value}
            isCreatedByUser={message.isCreatedByUser}
            message={message}
            showCursor={showCursor}
          />
        </div>
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
      />
    );
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
    return (
      <ActionCall initialProgress={toolCall.progress ?? 0.1} args={toolCall.function.arguments} />
    );
  } else if (part.type === ContentTypes.IMAGE_FILE) {
    const imageFile = part[ContentTypes.IMAGE_FILE];
    return (
      <Image
        imagePath={imageFile.filepath}
        width={imageFile.width ?? 1080}
        height={imageFile.height ?? 1920}
        altText={imageFile.filename ?? 'Uploaded Image'}
        // n={imageFiles.length}
        // i={i}
      />
    );
  }

  return null;
}
