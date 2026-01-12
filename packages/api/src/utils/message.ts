import { Constants } from 'librechat-data-provider';
import type { TFile, TMessage } from 'librechat-data-provider';

/** Fields to strip from files before client transmission */
const FILE_STRIP_FIELDS = ['text', '_id', '__v'] as const;

/** Fields to strip from messages before client transmission */
const MESSAGE_STRIP_FIELDS = ['fileContext'] as const;

/**
 * Strips large/unnecessary fields from a file object before transmitting to client.
 * Use this within existing loops when building file arrays to avoid extra iterations.
 *
 * @param file - The file object to sanitize
 * @returns A new file object without the stripped fields
 *
 * @example
 * // Use in existing file processing loop:
 * for (const attachment of client.options.attachments) {
 *   if (messageFiles.has(attachment.file_id)) {
 *     userMessage.files.push(sanitizeFileForTransmit(attachment));
 *   }
 * }
 */
export function sanitizeFileForTransmit<T extends Partial<TFile>>(
  file: T,
): Omit<T, (typeof FILE_STRIP_FIELDS)[number]> {
  const sanitized = { ...file };
  for (const field of FILE_STRIP_FIELDS) {
    delete sanitized[field as keyof typeof sanitized];
  }
  return sanitized;
}

/**
 * Sanitizes a message object before transmitting to client.
 * Removes large fields like `fileContext` and strips `text` from embedded files.
 *
 * @param message - The message object to sanitize
 * @returns A new message object safe for client transmission
 *
 * @example
 * sendEvent(res, {
 *   final: true,
 *   requestMessage: sanitizeMessageForTransmit(userMessage),
 *   responseMessage: response,
 * });
 */
export function sanitizeMessageForTransmit<T extends Partial<TMessage>>(
  message: T,
): Omit<T, (typeof MESSAGE_STRIP_FIELDS)[number]> {
  if (!message) {
    return message as Omit<T, (typeof MESSAGE_STRIP_FIELDS)[number]>;
  }

  const sanitized = { ...message };

  // Remove message-level fields
  for (const field of MESSAGE_STRIP_FIELDS) {
    delete sanitized[field as keyof typeof sanitized];
  }

  // Always create a new array when files exist to maintain full immutability
  if (Array.isArray(sanitized.files)) {
    sanitized.files = sanitized.files.map((file) => sanitizeFileForTransmit(file));
  }

  return sanitized;
}

/** Minimal message shape for thread traversal */
type ThreadMessage = {
  messageId: string;
  parentMessageId?: string | null;
  files?: Array<{ file_id?: string }>;
};

/** Result of thread data extraction */
export type ThreadData = {
  messageIds: string[];
  fileIds: string[];
};

/**
 * Extracts thread message IDs and file IDs in a single O(n) pass.
 * Builds a Map for O(1) lookups, then traverses the thread collecting both IDs.
 *
 * @param messages - All messages in the conversation (should be queried with select for efficiency)
 * @param parentMessageId - The ID of the parent message to start traversal from
 * @returns Object containing messageIds and fileIds arrays
 */
export function getThreadData(
  messages: ThreadMessage[],
  parentMessageId: string | null | undefined,
): ThreadData {
  const result: ThreadData = { messageIds: [], fileIds: [] };

  if (!messages || messages.length === 0 || !parentMessageId) {
    return result;
  }

  /** Build Map for O(1) lookups instead of O(n) .find() calls */
  const messageMap = new Map<string, ThreadMessage>();
  for (const msg of messages) {
    messageMap.set(msg.messageId, msg);
  }

  const fileIdSet = new Set<string>();
  const visitedIds = new Set<string>();
  let currentId: string | null | undefined = parentMessageId;

  /** Single traversal: collect message IDs and file IDs together */
  while (currentId) {
    if (visitedIds.has(currentId)) {
      break;
    }
    visitedIds.add(currentId);

    const message = messageMap.get(currentId);
    if (!message) {
      break;
    }

    result.messageIds.push(message.messageId);

    /** Collect file IDs from this message */
    if (message.files) {
      for (const file of message.files) {
        if (file.file_id) {
          fileIdSet.add(file.file_id);
        }
      }
    }

    currentId = message.parentMessageId === Constants.NO_PARENT ? null : message.parentMessageId;
  }

  result.fileIds = Array.from(fileIdSet);
  return result;
}
