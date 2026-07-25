import type { ChatGptConversation, ImportSummary } from './types';
import type { ExportLayout } from './manifest';
import { MANIFEST_ENTRY, parseManifest, resolveLayout } from './manifest';
import { openArchive } from './archive';

interface ShardTotals {
  conversations: number;
  archived: number;
  starred: number;
}

function tallyShard(conversations: ChatGptConversation[], totals: ShardTotals): void {
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
): Promise<{ summary: ImportSummary; layout: ExportLayout }> {
  const archive = await openArchive(filepath);

  try {
    const hasManifest = archive.entries.some((entry) => entry.name === MANIFEST_ENTRY);
    const manifest = hasManifest ? parseManifest(await archive.read(MANIFEST_ENTRY)) : null;
    const layout = resolveLayout(archive.entries, manifest);

    if (layout.conversationShards.length === 0) {
      throw new Error('Unsupported import type');
    }

    const totals: ShardTotals = { conversations: 0, archived: 0, starred: 0 };
    for (const shard of layout.conversationShards) {
      const parsed = JSON.parse((await archive.read(shard)).toString('utf8'));
      if (!Array.isArray(parsed)) {
        throw new Error('Unsupported import type');
      }
      tallyShard(parsed as ChatGptConversation[], totals);
    }

    let assetBytes = 0;
    for (const entry of layout.assetEntries) {
      assetBytes += entry.bytes;
    }

    return {
      layout,
      summary: {
        source: 'chatgpt',
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
