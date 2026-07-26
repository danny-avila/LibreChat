import type { ChatGptConversation, ExportFormat, ImportSummary } from './types';
import type { ExportLayout } from './manifest';
import {
  MANIFEST_ENTRY,
  parseManifest,
  resolveLayout,
  detectExportFormat,
  hasChatGptConversationShape,
} from './manifest';
import { openArchive } from './archive';

interface ShardTotals {
  conversations: number;
  archived: number;
  starred: number;
}

function tallyChatGptShard(conversations: ChatGptConversation[], totals: ShardTotals): void {
  for (const conv of conversations) {
    totals.conversations += 1;
    if (conv.is_archived === true) {
      totals.archived += 1;
    }
    if (conv.is_starred === true || conv.pinned_time != null) {
      totals.starred += 1;
    }
  }
}

export async function inspectExport(
  filepath: string,
): Promise<{ summary: ImportSummary; layout: ExportLayout; format: ExportFormat }> {
  const archive = await openArchive(filepath);

  try {
    const hasManifest = archive.entries.some((entry) => entry.name === MANIFEST_ENTRY);
    const manifest = hasManifest ? parseManifest(await archive.read(MANIFEST_ENTRY)) : null;
    const layout = resolveLayout(archive.entries, manifest);

    if (layout.conversationShards.length === 0) {
      throw new Error('Unsupported import type');
    }

    /** The conversation, archived and starred counts the confirmation screen
     * shows exist nowhere but inside the shards, so they cannot be read from
     * a header — the shards have to be parsed. Each one is parsed, tallied
     * and dropped before the next is read, so peak heap stays at a single
     * shard rather than the whole export. The format is decided by the first
     * shard's element shape, the only thing distinguishing a Claude export
     * (whose conversations carry `chat_messages`) from a ChatGPT one. */
    const totals: ShardTotals = { conversations: 0, archived: 0, starred: 0 };
    let format: ExportFormat | null = null;

    for (const shard of layout.conversationShards) {
      const parsed: unknown = JSON.parse((await archive.read(shard)).toString('utf8'));
      if (!Array.isArray(parsed)) {
        throw new Error('Unsupported import type');
      }

      if (format === null) {
        format = detectExportFormat(parsed);
        if (format === null) {
          throw new Error('Unsupported import type');
        }
      }

      if (format === 'claude') {
        totals.conversations += parsed.length;
        continue;
      }

      if (!hasChatGptConversationShape(parsed)) {
        throw new Error('Unsupported import type');
      }
      tallyChatGptShard(parsed as ChatGptConversation[], totals);
    }

    if (format === 'claude') {
      /** A Claude export ships no binaries and has no archived or starred
       * flags, so those counters are structurally zero rather than untallied. */
      return {
        layout,
        format,
        summary: {
          source: 'claude',
          manifestVersion: null,
          conversations: totals.conversations,
          shards: layout.conversationShards.length,
          assets: 0,
          assetBytes: 0,
          archived: 0,
          starred: 0,
        },
      };
    }

    let assetBytes = 0;
    for (const entry of layout.assetEntries) {
      assetBytes += entry.bytes;
    }

    return {
      layout,
      format: 'chatgpt',
      summary: {
        source: layout.version === null ? 'chatgpt-legacy' : 'chatgpt',
        manifestVersion: layout.version,
        conversations: totals.conversations,
        shards: layout.conversationShards.length,
        assets: layout.assetEntries.length,
        assetBytes,
        archived: totals.archived,
        starred: totals.starred,
      },
    };
  } finally {
    archive.close();
  }
}
