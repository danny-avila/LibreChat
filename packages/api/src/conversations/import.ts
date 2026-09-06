import { BSON, ObjectId } from 'mongodb';

import type { Document } from 'mongodb';

export const MAX_CONVERSATION_IMPORT_BSON_BYTES: number = 16 * 1024 * 1024;
export const CONVERSATION_IMPORT_BSON_HEADROOM_BYTES: number = 64 * 1024;

export interface ConversationImportWriteBatch {
  conversations: readonly Document[];
  messages: readonly Document[];
  tenantId?: string;
}

export interface ConversationImportWriteOperations {
  saveConversations: () => Promise<void>;
  saveMessages: () => Promise<void>;
  updateTagCounts: () => Promise<void>;
  deleteMessages: () => Promise<void>;
  deleteConversations: () => Promise<void>;
  onTagCountError?: (error: Error) => void;
  onCleanupError?: (error: Error, resource: 'messages' | 'conversations') => void;
}

export class ConversationImportError extends Error {
  readonly code = 'invalid_request';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConversationImportError';
  }
}

function importWriteError(message: string, cause?: unknown): ConversationImportError {
  return new ConversationImportError(message, cause === undefined ? undefined : { cause });
}

export function assertConversationImportWriteSize(batch: ConversationImportWriteBatch): void {
  const maxDocumentBytes =
    MAX_CONVERSATION_IMPORT_BSON_BYTES - CONVERSATION_IMPORT_BSON_HEADROOM_BYTES;
  const assertDocumentSize = (document: Document): void => {
    let size: number;
    try {
      size = BSON.calculateObjectSize({
        ...document,
        _id: new ObjectId(),
        __v: 0,
        ...(batch.tenantId == null ? {} : { tenantId: batch.tenantId }),
      });
    } catch (error) {
      throw importWriteError('An imported record cannot be stored', error);
    }
    if (size > maxDocumentBytes) {
      throw importWriteError('An imported record exceeds the storage size limit');
    }
  };
  for (const conversation of batch.conversations) {
    assertDocumentSize(conversation);
  }
  for (const message of batch.messages) {
    assertDocumentSize(message);
  }
}

export async function executeConversationImportWrites(
  operations: ConversationImportWriteOperations,
): Promise<void> {
  try {
    await operations.saveConversations();
    await operations.saveMessages();
  } catch (error) {
    try {
      await operations.deleteMessages();
    } catch (cleanupError) {
      operations.onCleanupError?.(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Failed to clean imported messages'),
        'messages',
      );
      throw error;
    }

    try {
      await operations.deleteConversations();
    } catch (cleanupError) {
      operations.onCleanupError?.(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Failed to clean imported conversations'),
        'conversations',
      );
    }
    throw error;
  }

  try {
    await operations.updateTagCounts();
  } catch (error) {
    operations.onTagCountError?.(
      error instanceof Error ? error : new Error('Failed to update imported tag counts'),
    );
  }
}
