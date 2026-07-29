import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type {
  ChatGptAttachment,
  ChatGptConversation,
  ConvertedMessage,
  ExportFormat,
  ImportedAsset,
  ImportProgress,
  ImportReport,
} from './types';
import type { SaveMessageDetails, RunImportInput, ProviderImportContext } from './sink';
import type { AssetReference } from './chatgpt/content';
import type { Archive } from './archive';
import {
  MANIFEST_ENTRY,
  parseManifest,
  resolveLayout,
  detectExportFormat,
  hasChatGptConversationShape,
} from './manifest';
import { collectAssetReferences } from './chatgpt/content';
import { convertConversation } from './chatgpt/convert';
import { runClaudeImport } from './claude/service';
import { runGrokImport } from './grok/service';
import { sanitizeImportError } from './errors';
import { openArchive } from './archive';
import { ingestAssets } from './assets';

interface ExportScan {
  /** Shards that parsed and validated, in export order. The conversion pass
   * re-reads only these, so a shard already recorded in `errors` is never
   * reported twice. */
  shards: string[];
  conversations: number;
  pointers: string[];
  attachments: Map<string, ChatGptAttachment>;
  references: Map<string, AssetReference>;
  /** The format the first shard that parsed turned out to be. A Claude or Grok
   * export aborts the scan immediately — neither has assets a conversation can
   * resolve, so nothing this pass collects applies to them. */
  format: ExportFormat;
}

class ShardShapeError extends Error {}

async function readShardJson(archive: Archive, shard: string): Promise<unknown> {
  return JSON.parse((await archive.read(shard)).toString('utf8')) as unknown;
}

function asChatGptConversations(parsed: unknown): ChatGptConversation[] {
  if (!Array.isArray(parsed)) {
    throw new ShardShapeError('expected an array of conversations');
  }
  if (!hasChatGptConversationShape(parsed)) {
    throw new ShardShapeError('expected ChatGPT conversation objects');
  }
  return parsed as ChatGptConversation[];
}

/**
 * Reads and validates one shard. Never retains the result: both passes drop
 * the parsed array as soon as they are done with it, which keeps peak heap
 * at one shard rather than the whole export.
 */
async function parseShard(archive: Archive, shard: string): Promise<ChatGptConversation[]> {
  return asChatGptConversations(await readShardJson(archive, shard));
}

function describeShardError(error: unknown, shard: string): string {
  if (error instanceof ShardShapeError) {
    return error.message;
  }
  return sanitizeImportError(error, `import shard ${shard}`);
}

function scanConversation(conv: ChatGptConversation, scan: ExportScan, seen: Set<string>): void {
  for (const node of Object.values(conv.mapping ?? {})) {
    if (!node.message) {
      continue;
    }
    for (const reference of collectAssetReferences(node.message)) {
      if (!seen.has(reference.pointer)) {
        seen.add(reference.pointer);
        scan.pointers.push(reference.pointer);
      }
      if (reference.width !== undefined || reference.height !== undefined) {
        scan.references.set(reference.pointer, reference);
      }
    }
    for (const attachment of node.message.metadata?.attachments ?? []) {
      scan.attachments.set(attachment.id, attachment);
    }
  }
}

/**
 * First pass over the export: parses every shard once to learn how many
 * conversations there are and which assets they reference, then throws the
 * parsed conversations away. Asset ingestion needs every pointer up front,
 * so this walk is what lets the conversion pass stream shard by shard
 * instead of holding the entire export in memory.
 *
 * One corrupt or non-array shard is recorded in `errors` and excluded from
 * the conversion pass without discarding the conversations in the others.
 *
 * A conversation the conversion pass will skip contributes no pointers:
 * ingesting its assets would create a second copy of every file and storage
 * object on every re-upload of an export already imported, all of them
 * unreferenced once the conversation itself is skipped. It still counts
 * towards `conversations`, which is the progress denominator the skip loop
 * advances.
 */
async function scanExport(
  archive: Archive,
  shards: string[],
  errors: string[],
  existingExternalIds: ReadonlySet<string>,
): Promise<ExportScan> {
  const scan: ExportScan = {
    shards: [],
    conversations: 0,
    pointers: [],
    attachments: new Map(),
    references: new Map(),
    format: 'chatgpt',
  };
  const seen = new Set<string>();
  let detected = false;

  for (const shard of shards) {
    try {
      const parsed = await readShardJson(archive, shard);

      if (!detected) {
        detected = true;
        scan.format = detectExportFormat(parsed) ?? 'chatgpt';
        if (scan.format !== 'chatgpt') {
          return scan;
        }
      }

      const conversations = asChatGptConversations(parsed);
      scan.shards.push(shard);
      scan.conversations += conversations.length;
      for (const conv of conversations) {
        if (existingExternalIds.has(conv.conversation_id)) {
          continue;
        }
        scanConversation(conv, scan, seen);
      }
    } catch (error) {
      errors.push(`${shard}: ${describeShardError(error, shard)}`);
    }
  }

  return scan;
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

    /** A shard the manifest declares but the archive omits is missing data, not
     * an absent feature: without this the run imports what survived and reports
     * success, and the user never learns which conversations were skipped. */
    for (const shard of layout.missingShards) {
      report.errors.push(`${shard}: listed in the manifest but missing from the archive`);
    }

    const providerRun: ProviderImportContext = {
      archive,
      shards: layout.conversationShards,
      input,
      report,
    };

    /** `inspectExport` already identified the format and the route passes it
     * through, so a Claude or Grok export skips the asset scan entirely rather
     * than reading its single large shard an extra time to re-learn its shape. */
    if (input.format === 'claude') {
      await runClaudeImport(providerRun);
      return report;
    }
    if (input.format === 'grok') {
      await runGrokImport(providerRun);
      return report;
    }

    const scan = await scanExport(
      archive,
      layout.conversationShards,
      report.errors,
      input.existingExternalIds,
    );

    if (scan.format === 'claude') {
      await runClaudeImport(providerRun);
      return report;
    }
    if (scan.format === 'grok') {
      await runGrokImport(providerRun);
      return report;
    }

    /** `messages.total` stays 0: the count is only known after conversion, so
     * the UI shows messages as a running count rather than a ratio.
     * `assets.total` counts the pointers the conversations actually
     * reference, not every `.dat` entry in the archive, so the counter can
     * reach its total even when the export ships assets nothing links to. */
    const progress: ImportProgress = {
      conversations: { done: 0, total: scan.conversations },
      messages: { done: 0, total: 0 },
      assets: { done: 0, total: scan.pointers.length },
    };

    await input.onPhase?.('assets');

    const assetResult = await ingestAssets({
      archive,
      layout,
      userId: input.userId,
      tenantId: input.tenantId,
      source: input.source,
      pointers: scan.pointers,
      attachments: scan.attachments,
      references: scan.references,
      deps: input.deps,
      isCancelled: input.isCancelled,
      onProgress: async (done) => {
        progress.assets.done = done;
        await input.onProgress?.(progress);
      },
    });

    report.assetsImported = assetResult.imported;
    report.assetsUnavailable = assetResult.unavailable;
    report.errors.push(...assetResult.errors);

    await input.onPhase?.('conversations');

    let cancelled = false;
    for (const shard of scan.shards) {
      if (cancelled) {
        break;
      }

      let conversations: ChatGptConversation[];
      try {
        conversations = await parseShard(archive, shard);
      } catch (error) {
        report.errors.push(`${shard}: ${describeShardError(error, shard)}`);
        continue;
      }

      for (const conv of conversations) {
        if (input.isCancelled && (await input.isCancelled())) {
          cancelled = true;
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
            `${conv.conversation_id}: ${sanitizeImportError(error, `import conversation ${conv.conversation_id}`)}`,
          );
        }

        progress.conversations.done += 1;
        await input.batch.maybeFlush();
        await input.onProgress?.(progress);
      }
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
