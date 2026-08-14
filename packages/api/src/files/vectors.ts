import fs from 'fs';
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
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
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

/**
 * Rewrites a delete batch so that at most one record drops each shared
 * vector-store document, and none do while a file outside the batch still
 * points at it. Files that would destroy embeddings another record is
 * using come back with `embedded: false`, which every RAG delete path
 * already treats as "nothing to remove" — so the guard holds without each
 * storage strategy having to know about sharing.
 *
 * Files are otherwise returned untouched, and the array is returned as-is
 * when nothing in it is embedded.
 */
export async function suppressSharedVectorDeletes<T extends DeletableFile>(
  files: T[],
  countVectorReferences: VectorReferenceCounter,
): Promise<T[]> {
  const embeddedFiles = files.filter((file) => file.embedded === true);
  if (embeddedFiles.length === 0) {
    return files;
  }

  /** First occurrence of each vector id wins the right to delete it. */
  const deleters = new Map<string, string>();
  for (const file of embeddedFiles) {
    const vectorId = resolveVectorId(file);
    if (!deleters.has(vectorId)) {
      deleters.set(vectorId, file.file_id);
    }
  }

  const remaining = await countVectorReferences({
    vectorIds: [...deleters.keys()],
    excludeFileIds: files.map((file) => file.file_id),
  });

  return files.map((file) => {
    if (file.embedded !== true) {
      return file;
    }
    const vectorId = resolveVectorId(file);
    const isDeleter = deleters.get(vectorId) === file.file_id;
    if (isDeleter && !remaining.get(vectorId)) {
      return file;
    }
    return { ...file, embedded: false };
  });
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
 * Candidates must already be scoped to the same owner, hash and embedding
 * context by the query that produced them.
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
