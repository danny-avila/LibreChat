import { logger } from '@librechat/data-schemas';
import { FileContext } from 'librechat-data-provider';
import { getSafeErrorMetadata } from '../utils/errors';

interface Avatar {
  filepath: string;
  source: string;
}

interface AvatarRequest {
  user: { id: string; tenantId?: string };
}

interface AvatarFile {
  file_id: string;
  filepath: string;
  user?: { toString(): string };
  tenantId?: string;
  source?: string;
  storageKey?: string;
  storageRegion?: string;
}

interface AvatarCommitInput<TRequest> {
  req: TRequest;
  query: { assistantId: string; user?: string };
  identity: { user: string; endpoint: string };
  avatar: Avatar;
  metadata: Record<string, string>;
}

interface AvatarCommitDeps<TRequest, TAssistant> {
  updateAssistantAvatar: (
    query: { assistantId: string; user?: string },
    avatar: Avatar,
    identity: { user: string; endpoint: string },
  ) => Promise<{ previousAvatar?: Avatar } | null>;
  updateProvider: (id: string, body: { metadata: Record<string, string> }) => Promise<TAssistant>;
  getFiles: (
    query: { filepath: string; context: FileContext },
    sort: null,
    projection: null,
    limit: number,
  ) => Promise<AvatarFile[] | null>;
  deleteFileByFilter: (query: {
    file_id: string;
    filepath: string;
    user: string;
  }) => Promise<unknown>;
  getStrategyFunctions: (source: string) => {
    deleteFile?: ((req: TRequest, file: AvatarFile) => Promise<unknown>) | null;
  };
}

/** Cleanup follows both successful writes and uses the old file's persisted storage identity. */
export async function commitAssistantAvatar<TRequest extends AvatarRequest, TAssistant>(
  { req, query, identity, avatar, metadata }: AvatarCommitInput<TRequest>,
  deps: AvatarCommitDeps<TRequest, TAssistant>,
): Promise<TAssistant> {
  const updated = await deps.updateAssistantAvatar(query, avatar, identity);
  if (!updated) {
    throw new Error('Assistant avatar reference was not updated');
  }
  const assistant = await deps.updateProvider(query.assistantId, {
    metadata: { ...metadata, avatar: avatar.filepath, avatar_source: avatar.source },
  });

  const oldAvatar = updated.previousAvatar;
  if (!oldAvatar?.filepath || oldAvatar.filepath === avatar.filepath) {
    return assistant;
  }
  try {
    const files = await deps.getFiles(
      { filepath: oldAvatar.filepath, context: FileContext.avatar },
      null,
      null,
      2,
    );
    // Provider metadata alone is not authority to delete another user's file.
    if (files?.length !== 1) {
      return assistant;
    }
    const file = files[0];
    const ownerId = file.user?.toString();
    if (
      !ownerId ||
      file.tenantId !== req.user.tenantId ||
      !file.source ||
      file.source !== oldAvatar.source
    ) {
      return assistant;
    }
    const { deleteFile } = deps.getStrategyFunctions(file.source);
    if (!deleteFile) {
      return assistant;
    }
    const ownerRequest = { ...req, user: { ...req.user, id: ownerId, _id: ownerId } };
    await deleteFile(ownerRequest, file);
    await deps.deleteFileByFilter({
      file_id: file.file_id,
      filepath: file.filepath,
      user: ownerId,
    });
  } catch (error) {
    logger.warn('[assistantAvatar] Replaced avatar cleanup failed', getSafeErrorMetadata(error));
  }
  return assistant;
}
