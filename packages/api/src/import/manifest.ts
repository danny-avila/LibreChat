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
    const parsed = JSON.parse(buffer.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (!obj.logical_files || typeof obj.logical_files !== 'object') {
      return null;
    }
    const logical = obj.logical_files as Record<string, unknown>;
    for (const entry of Object.values(logical)) {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }
      const logicalEntry = entry as Record<string, unknown>;
      if (!Array.isArray(logicalEntry.files)) {
        return null;
      }
      if (!logicalEntry.files.every((f) => typeof f === 'string')) {
        return null;
      }
    }
    return {
      version: typeof obj.version === 'number' ? obj.version : null,
      logical_files: logical as Record<string, { files: string[]; sharded: boolean }>,
    };
  } catch (error) {
    logger.warn('[import] Unreadable export manifest, falling back to filename detection', error);
    return null;
  }
}

function shardsFromManifest(manifest: ExportManifest, present: Set<string>): string[] {
  const logical = manifest.logical_files[CONVERSATIONS_LOGICAL];
  if (!logical?.files || !Array.isArray(logical.files) || logical.files.length === 0) {
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
