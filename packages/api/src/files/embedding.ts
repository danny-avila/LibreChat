import { logger, NO_EMBEDDING_ENTITY } from '@librechat/data-schemas';

/** The subset of a file record needed to work out where its chunks live. */
export interface EmbeddedFileRef {
  file_id: string;
  embedded?: boolean;
  embedding_entity_id?: string;
}

/** Looks up, for files with no recorded entity, the agents that reference them. */
export type LegacyEntityLookup = (params: {
  file_ids: string[];
}) => Promise<Record<string, string>>;

/**
 * Whether the file carries the entity its vectors were written under. False for
 * records that predate the field — their scope has to be inferred instead.
 */
export const hasRecordedEmbeddingEntity = (file: EmbeddedFileRef): boolean =>
  file.embedding_entity_id != null && file.embedding_entity_id !== '';

/**
 * The entity to name when reaching the file's chunks, or `undefined` when they
 * are the user's own. A recorded `NO_EMBEDDING_ENTITY` is a positive statement
 * that the upload was user-scoped, not an absence of information.
 */
export const getRecordedEmbeddingEntityId = (file: EmbeddedFileRef): string | undefined => {
  if (!hasRecordedEmbeddingEntity(file) || file.embedding_entity_id === NO_EMBEDDING_ENTITY) {
    return undefined;
  }
  return file.embedding_entity_id;
};

/**
 * Maps each embedded file in a batch to the entity that owns its chunks.
 *
 * The recorded value decides, because it is the only thing that reflects what
 * was actually sent to the RAG service at embed time. An agent's current
 * `file_search` association proves nothing about that: an already-owned file id
 * can be added to any agent's `tool_resources` afterwards, and a message
 * attachment is embedded with no entity at all — scoping either one to an agent
 * sends the delete looking in a namespace that never held the chunks.
 *
 * Files written before the field existed have nothing recorded, so they alone
 * fall back to the association lookup. It is a guess, but a strictly better one
 * than naming no entity at all, which is what those files got previously. A
 * failed lookup leaves them user-scoped rather than blocking the delete, so a
 * legacy file is never left undeletable.
 */
export async function resolveEmbeddingEntityIds({
  files,
  lookupLegacyEntityIds,
}: {
  files: EmbeddedFileRef[];
  lookupLegacyEntityIds: LegacyEntityLookup;
}): Promise<Record<string, string>> {
  const entityIdByFileId: Record<string, string> = {};
  const legacyFileIds: string[] = [];

  for (const file of files) {
    if (file.embedded !== true || !file.file_id) {
      continue;
    }
    if (!hasRecordedEmbeddingEntity(file)) {
      legacyFileIds.push(file.file_id);
      continue;
    }
    const entityId = getRecordedEmbeddingEntityId(file);
    if (entityId) {
      entityIdByFileId[file.file_id] = entityId;
    }
  }

  if (legacyFileIds.length === 0) {
    return entityIdByFileId;
  }

  try {
    const inferred = await lookupLegacyEntityIds({ file_ids: legacyFileIds });
    for (const fileId of legacyFileIds) {
      const entityId = inferred[fileId];
      if (entityId) {
        entityIdByFileId[fileId] = entityId;
      }
    }
  } catch (error) {
    logger.error(
      '[resolveEmbeddingEntityIds] Could not infer the owner of files predating embedding_entity_id; treating them as user-scoped',
      error,
    );
  }

  return entityIdByFileId;
}
