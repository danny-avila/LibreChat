import type {
  ExportFormat,
  ImportPhase,
  ImportReport,
  ImportProgress,
  ConvertedMessage,
} from './types';
import type { AssetDeps } from './assets';
import type { Archive } from './archive';

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
  /** Resolves `true` when a flush actually ran. "Buffered" and "written" are
   * different states, and the importer's asset cleanup depends on the
   * difference. */
  maybeFlush(): Promise<boolean>;
  saveBatch(): Promise<void>;
}

/** Everything a per-provider run needs from `runImport`. Providers whose
 * exports ship no binaries skip the asset phase entirely and therefore share
 * one context: the open archive, the shards to convert, and the input and
 * report the job pipeline is already accumulating into. */
export interface ProviderImportContext {
  archive: Archive;
  shards: string[];
  input: RunImportInput;
  report: ImportReport;
}

export interface RunImportInput {
  filepath: string;
  userId: string;
  tenantId?: string;
  /** Retention deadline for everything this run writes, when the deployment
   * sets one. The batch builder already applies it to conversations and
   * messages; assets have to carry it too or they outlive the chats. */
  expiredAt?: Date;
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
