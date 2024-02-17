import { ToolCallTypes } from 'librechat-data-provider';
import type {
  ContentPart,
  CodeToolCall,
  ImageFile,
  Text,
  PartMetadata,
} from 'librechat-data-provider';

export function isText(part: ContentPart): part is Text & PartMetadata {
  return (part as Text).value !== undefined;
}

export function isCodeToolCall(part: ContentPart): part is CodeToolCall & PartMetadata {
  return (part as CodeToolCall).type === ToolCallTypes.CODE_INTERPRETER;
}

export function isImageFile(part: ContentPart): part is ImageFile & PartMetadata {
  return (part as ImageFile).file_id !== undefined;
}
