import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import { generateShortLivedToken } from '~/crypto/jwt';
import { resolveVectorId } from '~/files/vectors';

interface DeleteRagFileParams {
  /** The user ID. Required for authentication. If not provided, the function returns false and logs an error. */
  userId: string;
  /**
   * The file object. Must have `embedded` and `file_id` properties, plus
   * `vectorId` when the record borrows another file's embeddings. Callers
   * reach this through `processDeleteRequest`, which clears `embedded` on
   * records whose vectors another file still needs.
   */
  file: {
    file_id: string;
    embedded?: boolean;
    vectorId?: string;
  };
}

/**
 * Deletes embedded document(s) from the RAG API.
 * This is a shared utility function used by all file storage strategies
 * (S3, Azure, Firebase, Local) to delete RAG embeddings when a file is deleted.
 *
 * @param params - The parameters object.
 * @param params.userId - The user ID for authentication.
 * @param params.file - The file object. Must have `embedded` and `file_id` properties.
 * @returns Returns true if deletion was successful or skipped, false if there was an error.
 */
export async function deleteRagFile({ userId, file }: DeleteRagFileParams): Promise<boolean> {
  if (!file.embedded || !process.env.RAG_API_URL) {
    return true;
  }

  if (!userId) {
    logger.error('[deleteRagFile] No user ID provided');
    return false;
  }

  const jwtToken = generateShortLivedToken(userId);
  const vectorId = resolveVectorId(file);

  try {
    await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      data: [vectorId],
    });
    logger.debug(`[deleteRagFile] Successfully deleted document ${vectorId} from RAG API`);
    return true;
  } catch (error) {
    const axiosError = error as { response?: { status?: number }; message?: string };
    if (axiosError.response?.status === 404) {
      logger.warn(
        `[deleteRagFile] Document ${vectorId} not found in RAG API, may have been deleted already`,
      );
      return true;
    } else {
      logger.error('[deleteRagFile] Error deleting document from RAG API:', axiosError.message);
      return false;
    }
  }
}
