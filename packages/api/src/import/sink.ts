import type { ConvertedMessage, ExportFormat, ImportProgress, ImportPhase } from './types';
import type { AssetDeps } from './assets';

export interface SaveMessageDetails {
  messageId: string;
  parentMessageId: string;
  text: string;
  sender: string;
  isCreatedByUser: boolean;
  model: string;
  createdAt: Date;
  endpoint: string;
  content?: ConvertedMessage['content'];
  attachments?: ConvertedMessage['attachments'];
  files?: ConvertedMessage['files'];
}

export interface ConversationOverrides {
  isArchived: boolean;
  pinned: boolean;
  model: string;
  importedFrom: { source: string; externalId: string };
}

export interface BatchSink {
  startConversation(endpoint?: string): void;
  saveMessage(details: SaveMessageDetails): void;
  finishConversation(
    title: string,
    createdAt: Date,
    convo: ConversationOverrides,
    model: string,
  ): void;
  maybeFlush(): Promise<void>;
  saveBatch(): Promise<void>;
}

export interface RunImportInput {
  filepath: string;
  userId: string;
  tenantId?: string;
  source: string;
  defaultModel: string;
  /** The format `inspectExport` already identified. Omit it and `runImport`
   * re-reads the first shard to detect it. */
  format?: ExportFormat;
  deps: AssetDeps;
  batch: BatchSink;
  existingExternalIds: Set<string>;
  onProgress?: (progress: ImportProgress) => Promise<void>;
  onPhase?: (phase: ImportPhase) => Promise<void>;
  isCancelled?: () => Promise<boolean>;
}
