import { nanoid } from 'nanoid';
import type { Types } from 'mongoose';

export const remoteInlineFileSource = 'remote_inline' as const;
export const remoteInlineFileMarkerPrefix = '__LIBRECHAT_REMOTE_INLINE_FILE__:';

type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

/**
 * Request validation error for Remote Agent API inline file inputs.
 * Controllers map this to a 400 response instead of treating malformed
 * request-owned file data as a server failure.
 */
export class RemoteAgentFileError extends Error {
  statusCode = 400;
  code = 'invalid_file_input';

  constructor(message: string) {
    super(message);
    this.name = 'RemoteAgentFileError';
  }
}

/**
 * In-memory file record used for provider-native Remote Agent API uploads.
 * It intentionally mirrors the fields consumed by existing LibreChat file
 * encoding helpers, while keeping the base64 payload transient in metadata.
 */
export interface RemoteAgentInlineFile {
  file_id: string;
  temp_file_id: string;
  filename: string;
  filepath: '';
  source: typeof remoteInlineFileSource;
  type: string;
  bytes: number;
  object: 'file';
  usage: 1;
  user?: string | Types.ObjectId;
  metadata: {
    inlineBase64: string;
  };
}

/**
 * Returns the input with remote file parts replaced by internal placeholders,
 * plus the transient file records that should be validated and provider-formatted.
 */
export interface RemoteAgentFileExtractionResult<T> {
  value: T;
  files: RemoteAgentInlineFile[];
}

interface ChatFilePart {
  type: 'file';
  file?: {
    filename?: string;
    file_data?: string;
  };
}

interface ChatTextPart {
  type: 'text';
  text?: string;
}

interface ChatMessage {
  role?: MessageRole;
  content?: string | Array<ChatTextPart | ChatFilePart | Record<string, unknown>> | null;
  [key: string]: unknown;
}

interface ResponseInputFilePart {
  type: 'input_file';
  filename?: string;
  file_data?: string;
}

interface ResponseInputTextPart {
  type: 'input_text';
  text?: string;
}

interface ResponseMessageItem {
  type?: string;
  role?: MessageRole;
  content?: string | Array<ResponseInputTextPart | ResponseInputFilePart | Record<string, unknown>>;
  [key: string]: unknown;
}

interface MessageContentPart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

interface MessageWithContent {
  content?: string | MessageContentPart[] | null;
  documents?: unknown;
  image_urls?: unknown;
}

function createInlineFile(
  filename: unknown,
  fileData: unknown,
  userId?: string | Types.ObjectId,
): RemoteAgentInlineFile {
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new RemoteAgentFileError('File input requires a filename.');
  }
  if (typeof fileData !== 'string' || fileData.trim() === '') {
    throw new RemoteAgentFileError(`File "${filename}" requires file_data.`);
  }

  const match = fileData.match(/^data:([^;,]*);base64,([\s\S]*)$/);
  if (!match) {
    throw new RemoteAgentFileError(`File "${filename}" must use a base64 data URL.`);
  }

  const mimeType = match[1]?.trim();
  const base64 = (match[2] ?? '').replace(/\s/g, '');
  if (!mimeType) {
    throw new RemoteAgentFileError(`File "${filename}" data URL requires a MIME type.`);
  }
  if (!base64) {
    throw new RemoteAgentFileError(`File "${filename}" contains empty base64 data.`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new RemoteAgentFileError(`File "${filename}" contains invalid base64 data.`);
  }

  const id = `remote_${nanoid()}`;
  return {
    file_id: id,
    temp_file_id: id,
    filename,
    filepath: '',
    source: remoteInlineFileSource,
    type: mimeType,
    bytes: Buffer.from(base64, 'base64').length,
    object: 'file',
    usage: 1,
    user: userId,
    metadata: {
      inlineBase64: base64,
    },
  };
}

/**
 * Extracts OpenAI-compatible `file` content parts from the latest user message.
 * File parts in older messages or non-user messages are rejected because remote
 * inline uploads are request-scoped and should only apply to the current turn.
 */
export function extractRemoteAgentChatFiles(
  messages: ChatMessage[],
  userId?: string | Types.ObjectId,
): RemoteAgentFileExtractionResult<ChatMessage[]> {
  let latestUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      latestUserIndex = i;
      break;
    }
  }

  const files: RemoteAgentInlineFile[] = [];

  const value = messages.map((message, messageIndex) => {
    if (!Array.isArray(message.content)) {
      return { ...message };
    }

    const content = message.content.map((part) => {
      if (part?.type !== 'file') {
        return part;
      }
      if (messageIndex !== latestUserIndex || message.role !== 'user') {
        throw new RemoteAgentFileError(
          'File inputs are only supported on the latest user message.',
        );
      }

      const filePart = part as ChatFilePart;
      const file = createInlineFile(filePart.file?.filename, filePart.file?.file_data, userId);
      files.push(file);
      /**
       * Keep a private text marker in the content stream so LibreChat's existing
       * message conversion can run unchanged. The marker is replaced with the
       * provider document block after `encodeAndFormatDocuments` returns.
       */
      return { type: 'text', text: `${remoteInlineFileMarkerPrefix}${file.file_id}` };
    });

    return { ...message, content };
  });

  return { value, files };
}

/**
 * Replaces internal remote inline file placeholders in an internal message with
 * provider document blocks, preserving surrounding text and image_url part order.
 * If the message would otherwise have no text, a nonblank fallback text block is
 * inserted for providers that reject document-only content.
 */
export function attachDocumentsToMessageContent(
  message: MessageWithContent,
  documents: MessageContentPart[],
  fallbackText: string,
): void {
  const content: MessageContentPart[] = [];
  let documentIndex = 0;
  let hasText = false;

  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part?.type === 'text') {
        const text = part.text ?? '';
        if (!text.trim()) {
          continue;
        }
        /** Marker order mirrors extraction order, so the next document belongs here. */
        if (
          text.trim().startsWith(remoteInlineFileMarkerPrefix) &&
          documentIndex < documents.length
        ) {
          content.push(documents[documentIndex]);
          documentIndex += 1;
          continue;
        }
        hasText = true;
        content.push(part);
      } else if (part?.type === 'image_url') {
        content.push(part);
      }
    }
  } else if (typeof message?.content === 'string' && message.content.trim()) {
    hasText = true;
    content.push({ type: 'text', text: message.content });
  }

  /** If conversion dropped or moved a marker unexpectedly, avoid losing the document. */
  content.push(...documents.slice(documentIndex));
  if (!hasText) {
    /** Bedrock and Anthropic reject a blank first text block before document content. */
    content.unshift({ type: 'text', text: fallbackText });
  }

  message.content = content;
  delete message.documents;
  delete message.image_urls;
}

/**
 * Extracts Open Responses `input_file` parts from the latest user message item.
 * The returned input remains compatible with `convertInputToMessages`, while
 * the extracted file records are passed through LibreChat's provider document
 * formatting path.
 */
export function extractRemoteAgentResponseFiles(
  input: string | ResponseMessageItem[],
  userId?: string | Types.ObjectId,
): RemoteAgentFileExtractionResult<string | ResponseMessageItem[]> {
  if (typeof input === 'string') {
    return { value: input, files: [] };
  }

  let latestUserIndex = -1;
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i];
    /** Responses accepts message items both with and without an explicit `type`. */
    const messageLike =
      item?.type === 'message' ||
      (item?.type == null && typeof item?.role === 'string' && item.content != null);
    if (messageLike && item.role === 'user') {
      latestUserIndex = i;
      break;
    }
  }

  const files: RemoteAgentInlineFile[] = [];

  const value = input.map((item, itemIndex) => {
    /** Keep this in sync with the latest-user lookup above. */
    const messageLike =
      item?.type === 'message' ||
      (item?.type == null && typeof item?.role === 'string' && item.content != null);
    if (!messageLike || !Array.isArray(item.content)) {
      return { ...item };
    }

    const content = item.content.map((part) => {
      if (part?.type !== 'input_file') {
        return part;
      }
      if (itemIndex !== latestUserIndex || item.role !== 'user') {
        throw new RemoteAgentFileError(
          'File inputs are only supported on the latest user input message.',
        );
      }

      const filePart = part as ResponseInputFilePart;
      const file = createInlineFile(filePart.filename, filePart.file_data, userId);
      files.push(file);
      /**
       * `convertInputToMessages` maps `input_text` to internal `text`, preserving
       * the marker position until document attachment replaces it.
       */
      return { type: 'input_text', text: `${remoteInlineFileMarkerPrefix}${file.file_id}` };
    });

    /** Normalize implicit message-like items to the explicit Responses message shape. */
    return { ...item, type: 'message', content };
  });

  return { value, files };
}
