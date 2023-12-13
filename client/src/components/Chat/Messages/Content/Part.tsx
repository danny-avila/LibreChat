import { ToolCallTypes } from 'librechat-data-provider';
import type {
  ContentPart,
  CodeToolCall,
  ImageFile,
  Text,
  PartMetadata,
} from 'librechat-data-provider';
import type { TDisplayProps } from '~/common';
import CodeAnalyze from './CodeAnalyze';
import Markdown from './Markdown';
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

function isText(part: ContentPart): part is Text & PartMetadata {
  return (part as Text).value !== undefined;
}

function isCodeToolCall(part: ContentPart): part is CodeToolCall & PartMetadata {
  return (part as CodeToolCall).type === ToolCallTypes.CODE_INTERPRETER;
}

function isImageFile(part: ContentPart): part is ImageFile & PartMetadata {
  return (part as ImageFile).file_id !== undefined;
}

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
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-70">
        <DisplayMessage
          text={part.value}
          isCreatedByUser={true}
          message={message}
          showCursor={showCursor}
        />
      </div>
    );
  } else if (isCodeToolCall(part)) {
    return (
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-70">
        <CodeAnalyze
          progress={part.progress ?? 0.1}
          code={part[ToolCallTypes.CODE_INTERPRETER].input}
        />
      </div>
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
