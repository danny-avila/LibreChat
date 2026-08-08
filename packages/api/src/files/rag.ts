import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import { RagScopes, generateShortLivedToken } from '~/crypto/jwt';

interface DeleteRagFileParams {
  /** The user ID. Required for authentication. If not provided, the function returns false and logs an error. */
  userId: string;
  /** The file object. Must have `embedded` and `file_id` properties. */
  file: {
    file_id: string;
    embedded?: boolean;
    /**
     * The entity (agent) whose knowledge base the file was embedded under, when
     * it was not embedded under the user. Its chunks are owned by that entity,
     * so a delete that names only the user matches nothing.
     */
    entity_id?: string;
  };
  /** The tenant the file belongs to. */
  tenantId?: string | null;
}

/**
 * Deletes embedded document(s) from the RAG API.
 * This is a shared utility function used by all file storage strategies
 * (S3, Azure, Firebase, Local) to delete RAG embeddings when a file is deleted.
 *
 * Resolves only when the chunks are gone — including the case where the RAG
 * API has never heard of them. Anything that leaves them in place throws, so
 * the caller's own failure handling runs and the file's metadata survives for
 * a retry. A swallowed failure here would report the file as deleted while its
 * chunks stayed behind, unreferenced and unreachable by any later delete.
 *
 * @param params - The parameters object.
 * @param params.userId - The user ID for authentication.
 * @param params.file - The file object. Must have `embedded` and `file_id` properties.
 * @param params.tenantId - The tenant the file belongs to.
 * @throws When the chunks could not be confirmed deleted.
 */
export async function deleteRagFile({
  userId,
  file,
  tenantId,
}: DeleteRagFileParams): Promise<void> {
  if (!file.embedded || !process.env.RAG_API_URL) {
    return;
  }

  if (!userId) {
    throw new Error('[deleteRagFile] No user ID provided');
  }

  const entityIds = file.entity_id ? [file.entity_id] : [];

  let jwtToken: string;
  try {
    jwtToken = generateShortLivedToken({
      userId,
      tenantId,
      entityIds,
      scopes: [RagScopes.documents],
    });
  } catch (error) {
    const message = (error as Error).message;
    logger.error('[deleteRagFile] Unable to mint a RAG API token:', message);
    throw new Error(`[deleteRagFile] Unable to mint a RAG API token: ${message}`);
  }

  try {
    await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      params: file.entity_id ? { entity_id: file.entity_id } : undefined,
      data: [file.file_id],
    });
    logger.debug(`[deleteRagFile] Successfully deleted document ${file.file_id} from RAG API`);
  } catch (error) {
    const axiosError = error as { response?: { status?: number }; message?: string };
    if (axiosError.response?.status === 404) {
      logger.warn(
        `[deleteRagFile] Document ${file.file_id} not found in RAG API, may have been deleted already`,
      );
      return;
    }
    logger.error('[deleteRagFile] Error deleting document from RAG API:', axiosError.message);
    throw new Error(
      `[deleteRagFile] Error deleting document ${file.file_id} from RAG API: ${axiosError.message}`,
    );
  }
}
