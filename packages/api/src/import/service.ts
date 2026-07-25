import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';

import type { ChatGptConversation, ImportedAsset, ImportProgress, ImportReport } from './types';
import type { ConvertedMessage } from './chatgpt/convert';
import type { AssetDeps } from './assets';
import type { Archive } from './archive';

import { MANIFEST_ENTRY, parseManifest, resolveLayout } from './manifest';
import { collectAssetPointers } from './chatgpt/content';
import { convertConversation } from './chatgpt/convert';
import { openArchive } from './archive';
import { ingestAssets } from './assets';

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
  deps: AssetDeps;
  batch: BatchSink;
  existingExternalIds: Set<string>;
  onProgress?: (progress: ImportProgress) => Promise<void>;
  isCancelled?: () => Promise<boolean>;
}

/**
 * Gathers every asset pointer referenced across all shards up front, reusing
 * `collectAssetPointers` per message rather than re-deriving the pointer
 * branches here, so `ingestAssets` can run once before conversion instead of
 * resolving pointers message-by-message during the conversion pass.
 */
function collectPointers(conversations: ChatGptConversation[]): string[] {
  const pointers = new Set<string>();

  for (const conv of conversations) {
    for (const node of Object.values(conv.mapping ?? {})) {
      if (!node.message) {
        continue;
      }
      for (const pointer of collectAssetPointers(node.message)) {
        pointers.add(pointer);
      }
    }
  }

  return Array.from(pointers);
}

/**
 * Parses every shard independently so one corrupt or non-array shard is
 * recorded in `errors` without discarding the conversations already found in
 * the other shards.
 */
async function readConversations(
  archive: Archive,
  shards: string[],
  errors: string[],
): Promise<ChatGptConversation[]> {
  const conversations: ChatGptConversation[] = [];

  for (const shard of shards) {
    try {
      const parsed = JSON.parse((await archive.read(shard)).toString('utf8'));
      if (!Array.isArray(parsed)) {
        errors.push(`${shard}: expected an array of conversations`);
        continue;
      }
      conversations.push(...(parsed as ChatGptConversation[]));
    } catch (error) {
      errors.push(`${shard}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return conversations;
}

function toSaveMessageDetails(message: ConvertedMessage): SaveMessageDetails {
  return {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId,
    text: message.text,
    sender: message.sender,
    isCreatedByUser: message.isCreatedByUser,
    model: message.model,
    createdAt: message.createdAt,
    endpoint: EModelEndpoint.openAI,
    content: message.content,
    attachments: message.attachments,
    files: message.files,
  };
}

/** Converts one conversation and writes it to the batch sink. Kept separate
 * from the run loop so a thrown conversion or write error is caught per
 * conversation rather than aborting the remaining ones. Returns the message
 * count so the caller can advance `progress.messages.done` in one step. */
function importConversation(
  conv: ChatGptConversation,
  input: RunImportInput,
  assets: Map<string, ImportedAsset>,
): number {
  const converted = convertConversation(conv, {
    userId: input.userId,
    assets,
    defaultModel: input.defaultModel,
  });

  input.batch.startConversation(EModelEndpoint.openAI);
  for (const message of converted.messages) {
    input.batch.saveMessage(toSaveMessageDetails(message));
  }
  input.batch.finishConversation(
    converted.title,
    converted.createdAt,
    {
      isArchived: converted.isArchived,
      pinned: converted.pinned,
      model: converted.model,
      importedFrom: { source: 'chatgpt', externalId: converted.externalId },
    },
    converted.model,
  );

  return converted.messages.length;
}

export async function runImport(input: RunImportInput): Promise<ImportReport> {
  const archive = await openArchive(input.filepath);

  const report: ImportReport = {
    imported: 0,
    skipped: 0,
    assetsImported: 0,
    assetsUnavailable: 0,
    errors: [],
  };

  try {
    const hasManifest = archive.entries.some((entry) => entry.name === MANIFEST_ENTRY);
    const manifest = hasManifest ? parseManifest(await archive.read(MANIFEST_ENTRY)) : null;
    const layout = resolveLayout(archive.entries, manifest);

    const conversations = await readConversations(
      archive,
      layout.conversationShards,
      report.errors,
    );

    /** `messages.total` stays 0: the count is only known after conversion, so
     * the UI shows messages as a running count rather than a ratio. */
    const progress: ImportProgress = {
      conversations: { done: 0, total: conversations.length },
      messages: { done: 0, total: 0 },
      assets: { done: 0, total: layout.assetEntries.length },
    };

    const assetResult = await ingestAssets({
      archive,
      layout,
      userId: input.userId,
      tenantId: input.tenantId,
      source: input.source,
      pointers: collectPointers(conversations),
      deps: input.deps,
      isCancelled: input.isCancelled,
      onProgress: (done) => {
        progress.assets.done = done;
      },
    });

    report.assetsImported = assetResult.imported;
    report.assetsUnavailable = assetResult.unavailable;
    report.errors.push(...assetResult.errors);

    for (const conv of conversations) {
      if (input.isCancelled && (await input.isCancelled())) {
        break;
      }

      if (input.existingExternalIds.has(conv.conversation_id)) {
        report.skipped += 1;
        progress.conversations.done += 1;
        continue;
      }

      try {
        progress.messages.done += importConversation(conv, input, assetResult.map);
        report.imported += 1;
      } catch (error) {
        report.errors.push(
          `${conv.conversation_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      progress.conversations.done += 1;
      await input.batch.maybeFlush();
      await input.onProgress?.(progress);
    }

    await input.batch.saveBatch();
    return report;
  } catch (error) {
    logger.error('[import] Import run failed', error);
    throw error;
  } finally {
    archive.close();
  }
}
