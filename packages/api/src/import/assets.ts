import { v4 as uuidv4 } from 'uuid';
import { logger } from '@librechat/data-schemas';
import { FileContext } from 'librechat-data-provider';

import type { ChatGptAttachment, ImportedAsset } from './types';
import type { ExportLayout } from './manifest';
import type { Archive } from './archive';

import { ASSET_NAMES_ENTRY } from './manifest';

export interface SaveBufferInput {
  userId: string;
  buffer: Buffer;
  fileName: string;
  tenantId?: string;
}

export type SaveBufferFn = (input: SaveBufferInput) => Promise<string>;

export interface CreateFileInput {
  user: string;
  file_id: string;
  bytes: number;
  filepath: string;
  filename: string;
  type: string;
  source: string;
  context: string;
  tenantId?: string;
}

export type CreateFileFn = (
  data: CreateFileInput,
  disableTTL: boolean,
) => Promise<{ file_id: string } | null>;

export interface AssetDeps {
  saveBuffer: SaveBufferFn;
  createFile: CreateFileFn;
}

export interface IngestInput {
  archive: Archive;
  layout: ExportLayout;
  userId: string;
  tenantId: string | undefined;
  source: string;
  pointers: string[];
  deps: AssetDeps;
  /** Attachment metadata keyed by the raw id (pointer with its scheme
   * stripped), used only to backfill `width`/`height` on the resulting
   * `ImportedAsset` when the export recorded them. */
  attachments?: Map<string, ChatGptAttachment>;
  onProgress?: (done: number) => void;
  isCancelled?: () => Promise<boolean>;
}

export interface IngestResult {
  map: Map<string, ImportedAsset>;
  imported: number;
  unavailable: number;
  errors: string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
};

function pointerId(pointer: string): string {
  return pointer.includes('://') ? pointer.split('://')[1] : pointer;
}

export function pointerToEntry(pointer: string): string {
  return `${pointerId(pointer)}.dat`;
}

function mimeOf(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

async function readAssetNames(
  archive: Archive,
  layout: ExportLayout,
): Promise<Record<string, string>> {
  if (!layout.assetNames) {
    return {};
  }
  try {
    return JSON.parse((await archive.read(ASSET_NAMES_ENTRY)).toString('utf8'));
  } catch (error) {
    logger.warn('[import] Unreadable asset name map', error);
    return {};
  }
}

function buildImportedAsset(
  fileId: string,
  filepath: string,
  originalName: string,
  type: string,
  attachment: ChatGptAttachment | undefined,
): ImportedAsset {
  const asset: ImportedAsset = { file_id: fileId, filepath, filename: originalName, type };
  if (attachment?.width !== undefined) {
    asset.width = attachment.width;
  }
  if (attachment?.height !== undefined) {
    asset.height = attachment.height;
  }
  return asset;
}

/** Reads one entry's bytes, hands them to storage, records the DB row, and
 * returns the `ImportedAsset` the caller renders. Kept separate from the
 * ingestion loop so a thrown storage/DB error is caught per-asset rather
 * than aborting the remaining pointers. */
async function ingestOne(
  pointer: string,
  entryName: string,
  originalName: string,
  input: IngestInput,
): Promise<ImportedAsset> {
  const { archive, userId, tenantId, deps } = input;
  const buffer = await archive.read(entryName);
  const type = mimeOf(originalName);
  const fileId = uuidv4();
  const fileName = `${fileId}-${originalName}`;

  const filepath = await deps.saveBuffer({ userId, buffer, fileName, tenantId });

  await deps.createFile(
    {
      user: userId,
      file_id: fileId,
      bytes: buffer.byteLength,
      filepath,
      filename: originalName,
      type,
      source: input.source,
      context: FileContext.message_attachment,
      tenantId,
    },
    true,
  );

  const attachment = input.attachments?.get(pointerId(pointer));
  return buildImportedAsset(fileId, filepath, originalName, type, attachment);
}

export async function ingestAssets(input: IngestInput): Promise<IngestResult> {
  const { archive, layout, pointers } = input;

  const present = new Set(layout.assetEntries.map((entry) => entry.name));
  const names = await readAssetNames(archive, layout);

  const map = new Map<string, ImportedAsset>();
  const errors: string[] = [];
  let imported = 0;
  let unavailable = 0;

  const unique = Array.from(new Set(pointers));

  for (const pointer of unique) {
    if (input.isCancelled && (await input.isCancelled())) {
      break;
    }

    const entryName = pointerToEntry(pointer);
    if (!present.has(entryName)) {
      unavailable += 1;
      continue;
    }

    const originalName = names[entryName] ?? entryName.replace(/\.dat$/, '');

    try {
      const asset = await ingestOne(pointer, entryName, originalName, input);
      map.set(pointer, asset);
      imported += 1;
      input.onProgress?.(imported);
    } catch (error) {
      errors.push(`${entryName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { map, imported, unavailable, errors };
}
