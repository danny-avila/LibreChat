import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';

/** Minimal shape needed to resolve where a file's embeddings actually live. */
export type VectorFileRef = Pick<TFile, 'file_id'> & Pick<Partial<TFile>, 'vectorId'>;

/**
 * Streams a file from disk and returns the hex SHA-256 of its bytes.
 * Streamed rather than buffered so a multi-hundred-megabyte upload does
 * not have to fit in memory alongside the storage and embedding uploads
 * that follow it.
 */
export function hashFileContent(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk: string | Buffer) => {
      hash.update(chunk);
    });
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Lowercased extension of a stored filename, including the dot.
 *
 * The RAG API picks its document loader from the staged filename's
 * extension before falling back to the content type, so the same bytes
 * uploaded as `.csv` and as `.txt` are split into different chunks.
 * Identical content is therefore only interchangeable when the extension
 * matches too.
 */
export function fileExtension(filename?: string | null): string {
  return filename ? path.extname(filename).toLowerCase() : '';
}

/**
 * The `file_id` the RAG API holds a file's chunks under. Files that own
 * their embeddings store no `vectorId`, so they resolve to themselves;
 * every RAG read and delete must go through this rather than reading
 * `file_id` directly.
 */
export function resolveVectorId(file: VectorFileRef): string {
  return file.vectorId || file.file_id;
}

/**
 * Collapses files that share a vector-store document down to one entry,
 * keeping the first occurrence. Two records pointing at the same chunks
 * would otherwise produce identical hits and a duplicated RAG round trip.
 */
export function dedupeByVectorId<T extends VectorFileRef>(files: T[]): T[] {
  if (files.length < 2) {
    return files;
  }

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const file of files) {
    const vectorId = resolveVectorId(file);
    if (seen.has(vectorId)) {
      continue;
    }
    seen.add(vectorId);
    unique.push(file);
  }
  return unique;
}

export type VectorReferenceCounter = (params: {
  vectorIds: string[];
  excludeFileIds?: string[];
}) => Promise<Map<string, number>>;

type DeletableFile = VectorFileRef & { embedded?: boolean };

export type SuppressedVectorDeletes<T> = {
  /** The batch to delete, with shared-vector destruction defused. */
  files: T[];
  /**
   * Vector documents this batch declined to drop inline. Recheck these once
   * the batch's outcomes are known — see `reclaimOrphanedVectors`.
   */
  deferredVectorIds: string[];
};

/**
 * Rewrites a delete batch so no record destroys embeddings another one is
 * still using. Files that would come back with `embedded: false`, which
 * every RAG delete path already treats as "nothing to remove" — so the guard
 * holds without each storage strategy having to know about sharing.
 *
 * A document goes inline only when exactly one file in the batch holds it and
 * nothing outside the batch does. Anything shared is deferred, including
 * within the batch: the per-file deletes run independently and a record whose
 * storage delete fails is kept, so letting its sibling drop the document here
 * would leave that survivor pointing at nothing.
 *
 * Files are otherwise returned untouched, and the array is returned as-is
 * when nothing in it is embedded.
 */
export async function suppressSharedVectorDeletes<T extends DeletableFile>(
  files: T[],
  countVectorReferences: VectorReferenceCounter,
): Promise<SuppressedVectorDeletes<T>> {
  const embeddedFiles = files.filter((file) => file.embedded === true);
  if (embeddedFiles.length === 0) {
    return { files, deferredVectorIds: [] };
  }

  const holdersInBatch = new Map<string, number>();
  for (const file of embeddedFiles) {
    const vectorId = resolveVectorId(file);
    holdersInBatch.set(vectorId, (holdersInBatch.get(vectorId) ?? 0) + 1);
  }

  const remaining = await countVectorReferences({
    vectorIds: [...holdersInBatch.keys()],
    excludeFileIds: files.map((file) => file.file_id),
  });

  const deferredVectorIds: string[] = [];
  for (const [vectorId, holders] of holdersInBatch) {
    if (holders > 1 || remaining.get(vectorId)) {
      deferredVectorIds.push(vectorId);
    }
  }

  if (deferredVectorIds.length === 0) {
    return { files, deferredVectorIds };
  }

  const deferred = new Set(deferredVectorIds);
  const rewritten = files.map((file) =>
    file.embedded === true && deferred.has(resolveVectorId(file))
      ? { ...file, embedded: false }
      : file,
  );

  return { files: rewritten, deferredVectorIds };
}

/**
 * Drops vector documents that nothing references any more, called once a
 * delete batch's own metadata is gone.
 *
 * Two concurrent deletes of files sharing a document each see the other's
 * record and both stand down, which would strand the embeddings forever.
 * Rechecking strictly after a request removes its own records makes that
 * impossible: for both to stand down again, each recheck would have to
 * precede the other's delete, and each already follows its own.
 *
 * @returns The vector ids actually dropped.
 */
export async function reclaimOrphanedVectors({
  vectorIds,
  countVectorReferences,
  deleteVectors,
}: {
  vectorIds: string[];
  countVectorReferences: VectorReferenceCounter;
  deleteVectors: (vectorId: string) => Promise<unknown>;
}): Promise<string[]> {
  if (vectorIds.length === 0) {
    return [];
  }

  const remaining = await countVectorReferences({ vectorIds });
  const orphaned = vectorIds.filter((vectorId) => !remaining.get(vectorId));
  await Promise.all(orphaned.map((vectorId) => deleteVectors(vectorId)));
  return orphaned;
}

/**
 * Upload contexts whose embeddings are owned by the uploading user rather
 * than by an agent. The RAG API stamps `entity_id` as the document owner
 * and rejects reads from a different owner, so content may only be reused
 * across records that were embedded under the same one.
 *
 * `message_attachment` is the only context reached with no `entity_id`, so
 * it is the only context where a hash match alone proves shared ownership.
 * Agent knowledge files are owned by their agent and must additionally be
 * confirmed as members of that agent's tool resource.
 */
export const USER_OWNED_EMBEDDING_CONTEXT: FileContext = FileContext.message_attachment;

/**
 * Picks which already-embedded file a new upload should borrow vectors
 * from, preferring one that owns its embeddings so borrowed references
 * never chain. Returns `undefined` when nothing is reusable.
 *
 * The query that produced these has already matched every part of the reuse
 * key — owner, hash, content type, extension and context — so any of them
 * would serve; this only chooses the one that keeps the reference flat.
 */
export function pickVectorReuseSource<T extends VectorFileRef & Pick<Partial<TFile>, 'embedded'>>(
  candidates: T[],
): T | undefined {
  let borrowed: T | undefined;
  for (const candidate of candidates) {
    if (candidate.embedded !== true) {
      continue;
    }
    if (!candidate.vectorId) {
      return candidate;
    }
    borrowed ??= candidate;
  }
  return borrowed;
}
