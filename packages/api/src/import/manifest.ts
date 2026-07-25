import { logger } from '@librechat/data-schemas';

import type { ArchiveEntry } from './archive';

export const MANIFEST_ENTRY = 'export_manifest.json';
export const ASSET_NAMES_ENTRY = 'conversation_asset_file_names.json';

const CONVERSATIONS_LOGICAL = 'conversations.json';
const SHARD_PATTERN = /^conversations-(\d+)\.json$/;

export interface ExportManifest {
  version: number | null;
  logical_files: Record<string, { files: string[]; sharded: boolean }>;
}

export interface ExportLayout {
  version: number | null;
  conversationShards: string[];
  assetNames: string | null;
  assetEntries: ArchiveEntry[];
}

export function parseManifest(buffer: Buffer): ExportManifest | null {
  try {
    const parsed = JSON.parse(buffer.toString('utf8')) as Partial<ExportManifest>;
    if (!parsed.logical_files || typeof parsed.logical_files !== 'object') {
      return null;
    }
    return { version: parsed.version ?? null, logical_files: parsed.logical_files };
  } catch (error) {
    logger.warn('[import] Unreadable export manifest, falling back to filename detection', error);
    return null;
  }
}

function shardsFromManifest(manifest: ExportManifest, present: Set<string>): string[] {
  const logical = manifest.logical_files[CONVERSATIONS_LOGICAL];
  if (!logical?.files?.length) {
    return [];
  }
  return logical.files.filter((name) => present.has(name));
}

function shardsFromFilenames(entries: ArchiveEntry[], present: Set<string>): string[] {
  if (present.has(CONVERSATIONS_LOGICAL)) {
    return [CONVERSATIONS_LOGICAL];
  }

  const sharded = entries
    .map((entry) => {
      const match = entry.name.match(SHARD_PATTERN);
      return match ? { name: entry.name, index: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; index: number } => entry !== null)
    .sort((a, b) => a.index - b.index);

  if (sharded.length > 0) {
    return sharded.map((entry) => entry.name);
  }

  const jsonEntries = entries.filter(
    (entry) => entry.name.endsWith('.json') && entry.name !== MANIFEST_ENTRY,
  );
  return jsonEntries.length === 1 ? [jsonEntries[0].name] : [];
}

export function resolveLayout(
  entries: ArchiveEntry[],
  manifest: ExportManifest | null,
): ExportLayout {
  const present = new Set(entries.map((entry) => entry.name));

  const fromManifest = manifest ? shardsFromManifest(manifest, present) : [];
  const conversationShards =
    fromManifest.length > 0 ? fromManifest : shardsFromFilenames(entries, present);

  return {
    version: manifest?.version ?? null,
    conversationShards,
    assetNames: present.has(ASSET_NAMES_ENTRY) ? ASSET_NAMES_ENTRY : null,
    assetEntries: entries.filter((entry) => entry.name.endsWith('.dat')),
  };
}
