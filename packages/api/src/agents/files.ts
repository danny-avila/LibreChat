import { nanoid } from 'nanoid';
import type { Types } from 'mongoose';

export const remoteInlineFileSource = 'remote_inline' as const;

type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

export class RemoteAgentFileError extends Error {
  statusCode = 400;
  code = 'invalid_file_input';

  constructor(message: string) {
    super(message);
    this.name = 'RemoteAgentFileError';
  }
}

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

  const match = fileData.match(/^data:([^;,]*);base64,(.*)$/s);
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
      return { type: 'text', text: `[File: ${file.filename}]` };
    });

    return { ...message, content };
  });

  return { value, files };
}

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
      return { type: 'input_text', text: `[File: ${file.filename}]` };
    });

    return { ...item, type: 'message', content };
  });

  return { value, files };
}
