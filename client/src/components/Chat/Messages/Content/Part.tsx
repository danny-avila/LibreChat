import { ToolCallTypes } from 'librechat-data-provider';
import type { ContentPart } from 'librechat-data-provider';
import type { TDisplayProps } from '~/common';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import Markdown from './Markdown';
import Image from './Image';
import { cn, isText, isImageFile, isCodeToolCall } from '~/utils';

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
  part: ContentPart;
  showCursor: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
}) {
  if (isText(part)) {
    // Access the value property
    return (
      <Container>
        <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-70">
          <DisplayMessage
            text={part.value}
            isCreatedByUser={true}
            message={message}
            showCursor={showCursor}
          />
        </div>
      </Container>
    );
  } else if (isCodeToolCall(part)) {
    const code_interpreter = part[ToolCallTypes.CODE_INTERPRETER];
    return (
      <CodeAnalyze
        initialProgress={part.progress ?? 0.1}
        code={code_interpreter.input}
        outputs={code_interpreter.outputs ?? []}
      />
    );
  } else if (isImageFile(part)) {
    return (
      <Image
        imagePath={part.filepath}
        width={part.width ?? 1080}
        height={part.height ?? 1920}
        altText={part.filename ?? 'Uploaded Image'}
        // n={imageFiles.length}
        // i={i}
      />
    );
  }

  return null;
}
