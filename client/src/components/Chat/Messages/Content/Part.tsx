import {
  ToolCallTypes,
  ContentTypes,
  imageGenTools,
  isImageVisionTool,
  Tools,
} from 'librechat-data-provider';
import { memo } from 'react';
import type { TMessageContentParts } from 'librechat-data-provider';
import { ErrorMessage } from './MessageContent';
import ExecuteCode from './Parts/ExecuteCode';
import RetrievalCall from './RetrievalCall';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import ToolCall from './ToolCall';
import ImageGen from './ImageGen';
import Text from './Parts/Text';
import Image from './Image';

type PartProps = {
  part?: TMessageContentParts;
  isSubmitting: boolean;
  showCursor: boolean;
  messageId: string;
  isCreatedByUser: boolean;
};

const Part = memo(({ part, isSubmitting, showCursor, messageId, isCreatedByUser }: PartProps) => {
  if (!part) {
    return null;
  }

  if (part.type === ContentTypes.ERROR) {
    return <ErrorMessage text={part[ContentTypes.TEXT].value} className="my-2" />;
  } else if (part.type === ContentTypes.TEXT) {
    const text = typeof part.text === 'string' ? part.text : part.text.value;

    if (typeof text !== 'string') {
      return null;
    }
    if (part.tool_call_ids != null && !text) {
      return null;
    }
    return (
      <Container>
        <Text
          text={text}
          isCreatedByUser={isCreatedByUser}
          messageId={messageId}
          showCursor={showCursor}
        />
      </Container>
    );
  } else if (part.type === ContentTypes.TOOL_CALL) {
    const toolCall = part[ContentTypes.TOOL_CALL];

    if (!toolCall) {
      return null;
    }

    const isToolCall =
      'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
    if (isToolCall && toolCall.name === Tools.execute_code) {
      return (
        <ExecuteCode
          args={typeof toolCall.args === 'string' ? toolCall.args : ''}
          outputs={[toolCall.output ?? '', {}]}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
        />
      );
    } else if (isToolCall) {
      return (
        <ToolCall
          args={toolCall.args ?? ''}
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
            <Container>
              <Text
                text={''}
                isCreatedByUser={isCreatedByUser}
                messageId={messageId}
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
});

export default Part;
