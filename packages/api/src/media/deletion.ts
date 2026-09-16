import { randomUUID } from 'node:crypto';
import { isMediaFileId } from '@librechat/data-schemas';
import type { MediaMethods } from '@librechat/data-schemas';
import { MediaServiceError } from './errors';

/** Every legacy storage-first delete passes this boundary before touching an immutable original. */
export async function deleteMediaAwareFile<
  TRequest extends { user?: { id?: string; tenantId?: string } },
  TFile extends { file_id: string },
  TClient,
>({
  request,
  file,
  client,
  deleteFile,
  repository,
}: {
  request: TRequest;
  file: TFile;
  client?: TClient;
  deleteFile(request: TRequest, file: TFile, client?: TClient): Promise<void>;
  repository: Pick<
    MediaMethods,
    'isMediaFile' | 'claimMediaAssetDeletion' | 'completeMediaAssetDeletion'
  >;
}): Promise<void> {
  if (!isMediaFileId(file.file_id)) {
    await deleteFile(request, file, client);
    return;
  }
  const ownerId = request.user?.id;
  if (!ownerId) {
    throw new MediaServiceError('forbidden', 403, 'Authentication is required.');
  }
  const scope = { ownerId, tenantId: request.user?.tenantId ?? null };
  if (!(await repository.isMediaFile(scope, file.file_id))) {
    throw new MediaServiceError('not_found', 404, 'Media content is unavailable.');
  }
  const token = randomUUID();
  const content = await repository.claimMediaAssetDeletion({ scope, fileId: file.file_id, token });
  if (!content) {
    throw new MediaServiceError(
      'version_conflict',
      409,
      'This original is retained by media history.',
    );
  }
  await deleteFile(request, { ...file, ...content }, client);
  await repository.completeMediaAssetDeletion({ scope, fileId: file.file_id, token });
}
