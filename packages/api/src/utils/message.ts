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
