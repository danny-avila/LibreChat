import { logger } from '@librechat/data-schemas';
import type { ExportFormat, GrokExport } from './types';
import type { ArchiveEntry } from './archive';

export const MANIFEST_ENTRY = 'export_manifest.json';
export const ASSET_NAMES_ENTRY = 'conversation_asset_file_names.json';

const CONVERSATIONS_LOGICAL = 'conversations.json';
const SHARD_PATTERN = /^conversations-(\d+)\.json$/;
/** Grok's conversation file, nested several directories deep under a
 * per-export uuid (`ttl/30d/export_data/<uuid>/prod-grok-backend.json`) and
 * shipped beside two unrelated JSON files, so it is found by filename rather
 * than by a fixed path or the lone-json fallback. */
const GROK_ENTRY = 'prod-grok-backend.json';

export interface ExportManifest {
  version: number | null;
  logical_files: Record<string, { files: string[]; sharded: boolean }>;
}

export interface ExportLayout {
  version: number | null;
  conversationShards: string[];
  /** Shards the manifest lists that the archive does not contain. Dropping
   * them silently made a truncated export look complete: the remaining shards
   * were treated as the whole thing, so inspection undercounted and the job
   * reported success having skipped the missing conversations. */
  missingShards: string[];
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

function shardsFromManifest(
  manifest: ExportManifest,
  present: Set<string>,
): { found: string[]; missing: string[] } {
  const logical = manifest.logical_files[CONVERSATIONS_LOGICAL];
  if (!logical?.files || !Array.isArray(logical.files) || logical.files.length === 0) {
    return { found: [], missing: [] };
  }

  const found: string[] = [];
  const missing: string[] = [];
  for (const name of logical.files) {
    if (present.has(name)) {
      found.push(name);
      continue;
    }
    missing.push(name);
  }
  return { found, missing };
}

function grokShards(entries: ArchiveEntry[]): string[] {
  const shards: string[] = [];
  for (const entry of entries) {
    if (entry.name === GROK_ENTRY || entry.name.endsWith(`/${GROK_ENTRY}`)) {
      shards.push(entry.name);
    }
  }
  return shards;
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

  const grok = grokShards(entries);
  if (grok.length > 0) {
    return grok;
  }

  const jsonEntries = entries.filter(
    (entry) => entry.name.endsWith('.json') && entry.name !== MANIFEST_ENTRY,
  );
  return jsonEntries.length === 1 ? [jsonEntries[0].name] : [];
}

/**
 * Shallow content check mirroring `getImporter`'s ChatGPT detection
 * (`api/server/utils/import/importers.js`): an empty array is trivially
 * fine, otherwise the first element must look like a ChatGPT conversation
 * (a `mapping` tree), not a Claude (`chat_messages`) or other export
 * shape. Without this, a shard that merely satisfies `Array.isArray`
 * would be silently misread as ChatGPT and produce conversations with no
 * messages instead of a reported error.
 */
export function hasChatGptConversationShape(conversations: unknown[]): boolean {
  if (conversations.length === 0) {
    return true;
  }
  const [first] = conversations;
  return typeof first === 'object' && first !== null && 'mapping' in first;
}

/**
 * Counterpart to `hasChatGptConversationShape` for Claude exports, whose
 * conversations carry a flat `chat_messages` array instead of a `mapping` tree.
 */
export function hasClaudeConversationShape(conversations: unknown[]): boolean {
  if (conversations.length === 0) {
    return false;
  }
  const [first] = conversations;
  return typeof first === 'object' && first !== null && 'chat_messages' in first;
}

/**
 * Counterpart to `hasChatGptConversationShape` for Grok exports, the only
 * supported format whose conversation file is an object rather than an array:
 * conversations live under a `conversations` key, each wrapped in a
 * `{ conversation, responses }` envelope.
 *
 * The envelope is what makes a file Grok, not the key: a bare
 * `{ "conversations": [] }` is any number of things and stays unsupported,
 * where an empty ChatGPT array is grandfathered onto the ChatGPT path.
 */
export function isGrokExport(parsed: unknown): parsed is GrokExport {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const { conversations } = parsed as GrokExport;
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return false;
  }
  const [first] = conversations;
  return typeof first === 'object' && first !== null && 'conversation' in first;
}

/**
 * Decides which converter a parsed conversation file belongs to. ChatGPT and
 * Claude both ship an array under `conversations.json` so only the element
 * shape distinguishes them, and Grok ships an object, so the array check is
 * itself part of the decision. An empty array stays on the ChatGPT path: it
 * imports nothing either way and that is the pre-existing behaviour.
 */
export function detectExportFormat(parsed: unknown): ExportFormat | null {
  if (isGrokExport(parsed)) {
    return 'grok';
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  if (parsed.length === 0) {
    return 'chatgpt';
  }
  if (hasClaudeConversationShape(parsed)) {
    return 'claude';
  }
  if (hasChatGptConversationShape(parsed)) {
    return 'chatgpt';
  }
  return null;
}

export function resolveLayout(
  entries: ArchiveEntry[],
  manifest: ExportManifest | null,
): ExportLayout {
  const present = new Set(entries.map((entry) => entry.name));

  const fromManifest = manifest
    ? shardsFromManifest(manifest, present)
    : { found: [], missing: [] };
  const useManifest = fromManifest.found.length > 0;
  const conversationShards = useManifest
    ? fromManifest.found
    : shardsFromFilenames(entries, present);

  return {
    version: manifest?.version ?? null,
    conversationShards,
    /** Only meaningful when the manifest was actually used: the filename
     * fallback has no declared list to be missing from. */
    missingShards: useManifest ? fromManifest.missing : [],
    assetNames: present.has(ASSET_NAMES_ENTRY) ? ASSET_NAMES_ENTRY : null,
    assetEntries: entries.filter((entry) => entry.name.endsWith('.dat')),
  };
}
