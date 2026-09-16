import type { DeleteFilesResponse } from 'librechat-data-provider';

/** What a delete pass reports back about the records it was given. */
export type FileDeletionOutcome = {
  deletedFileIds?: string[];
  failedFileIds?: string[];
};

/** The `{ tool_resource, file_id }` pair an agent resource unlink takes. */
export type AgentResourceFileRef = {
  tool_resource: string;
  file_id: string;
};

type OwnableFileRecord = {
  file_id: string;
  user?: string | { toString: () => string } | null;
};

export type AgentResourceDeletion<TFile> = {
  /** Attached files the caller owns: storage, vectors and metadata go with the unlink. */
  ownedFiles: TFile[];
  /** Attached files owned by someone else, or with no metadata left: unlink the association only. */
  unlinkOnlyFiles: AgentResourceFileRef[];
};

export const PARTIAL_FILE_DELETION_MESSAGE = 'Some files could not be deleted';

/**
 * Shapes the body of a delete response. A record whose storage delete failed is not an error for
 * the request as a whole, so the outcome travels in the body rather than the status: clients read
 * `failedFileIds` to know what is still on disk, and treat everything else they asked for as gone.
 */
export const buildDeleteFilesResponse = (
  result: FileDeletionOutcome | null | undefined,
  successMessage: string,
): DeleteFilesResponse => {
  const deletedFileIds = result?.deletedFileIds ?? [];
  const failedFileIds = result?.failedFileIds ?? [];
  return {
    message: failedFileIds.length > 0 ? PARTIAL_FILE_DELETION_MESSAGE : successMessage,
    deletedFileIds,
    failedFileIds,
  };
};

/**
 * Splits the files a delete request names for one agent tool resource into the ones whose storage
 * and embeddings must go with the unlink, and the ones only the association can be removed for.
 *
 * A file the caller owns is theirs to destroy, so it travels through the full delete pass; a file
 * that belongs to another user, or that no longer has a metadata record, keeps its bytes and its
 * chunks and loses only its link to the agent. A file the request names but the tool resource does
 * not hold appears in neither list.
 */
export const partitionAgentResourceFiles = <TFile extends OwnableFileRecord>({
  requestedFileIds,
  attachedFileIds,
  fileRecords,
  toolResource,
  userId,
}: {
  requestedFileIds: string[];
  attachedFileIds: string[];
  fileRecords: TFile[];
  toolResource: string;
  userId: string;
}): AgentResourceDeletion<TFile> => {
  const attached = new Set(attachedFileIds);
  const recordsById = new Map(fileRecords.map((file) => [file.file_id, file]));
  const seen = new Set<string>();
  const ownedFiles: TFile[] = [];
  const unlinkOnlyFiles: AgentResourceFileRef[] = [];

  for (const fileId of requestedFileIds) {
    if (!attached.has(fileId) || seen.has(fileId)) {
      continue;
    }
    seen.add(fileId);
    const record = recordsById.get(fileId);
    if (record != null && record.user?.toString() === userId) {
      ownedFiles.push(record);
      continue;
    }
    unlinkOnlyFiles.push({ tool_resource: toolResource, file_id: fileId });
  }

  return { ownedFiles, unlinkOnlyFiles };
};
