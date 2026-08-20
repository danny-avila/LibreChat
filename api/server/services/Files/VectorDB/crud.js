const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { logAxiosError, generateShortLivedToken } = require('@librechat/api');

/**
 * Deletes a file's embedded chunks from the vector database.
 *
 * rag_api deletes with `delete_scoped(ids, owners)` where the owner set is the
 * token's user plus any `entity_id` the caller names. Chunks embedded under an
 * entity — every agent knowledge-base file — are therefore outside an
 * unscoped delete's reach: it matches nothing, answers 404, and the chunks
 * survive. So when the file records an owning entity we send it, and we stop
 * reading a failure as success: for those files anything other than a 2xx
 * means the chunks may still be there. Files with no owning entity keep the
 * previous behaviour exactly, including its tolerance of a 404. See #14988.
 *
 * @param {ServerRequest} req - The request object from Express.
 * @param {MongoFile} file - The file object to be deleted, as stored in Mongo.
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the chunks are gone, or rejects when
 *          an entity-owned delete could not be shown to have removed them.
 */
const deleteVectors = async (req, file) => {
  if (!file.embedded || !process.env.RAG_API_URL) {
    return;
  }
  const entityId = file.entity_id;
  try {
    const jwtToken = generateShortLivedToken(req.user.id);

    return await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      /* The entity travels as a query parameter, never in the body: an older
       * rag_api ignores a parameter it does not declare, so a new client stays
       * inert against it rather than breaking. */
      ...(entityId ? { params: { entity_id: entityId } } : {}),
      data: [file.file_id],
    });
  } catch (error) {
    logAxiosError({
      error,
      message: 'Error deleting vectors',
    });
    const status = error.response?.status;
    if (status >= 200 && status < 300) {
      /* A rejection carrying a success status did not come from the delete
       * itself. Pre-existing behaviour: not our failure to report. */
      return;
    }
    if (!entityId && (!error.response || status === 404)) {
      /* User-owned chunks, and either no answer or "already gone". Tolerated
       * before this change and tolerated now — invariant 4's sibling. */
      return;
    }
    logger.warn(
      `Error deleting vectors for file ${file.file_id}${
        entityId ? ` scoped to entity ${entityId}` : ''
      }; its embedded chunks may remain`,
    );
    throw new Error(error.message || 'An error occurred during file deletion.');
  }
};

/**
 * Uploads a file to the configured Vector database
 *
 * @param {Object} params - The params object.
 * @param {Object} params.req - The request object from Express. It should have a `user` property with an `id` representing the user
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {string} params.file_id - The file ID.
 * @param {string} [params.entity_id] - The entity ID for shared resources.
 * @param {Object} [params.storageMetadata] - Storage metadata for dual storage pattern.
 *
 * @returns {Promise<{ filepath: string, bytes: number }>}
 *          A promise that resolves to an object containing:
 *            - filepath: The path where the file is saved.
 *            - bytes: The size of the file in bytes.
 */
async function uploadVectors({ req, file, file_id, entity_id, storageMetadata }) {
  if (!process.env.RAG_API_URL) {
    throw new Error('RAG_API_URL not defined');
  }

  try {
    const jwtToken = generateShortLivedToken(req.user.id);
    const formData = new FormData();
    formData.append('file_id', file_id);
    formData.append('file', fs.createReadStream(file.path));
    if (entity_id != null && entity_id) {
      formData.append('entity_id', entity_id);
    }

    // Include storage metadata for RAG API to store with embeddings
    if (storageMetadata) {
      formData.append('storage_metadata', JSON.stringify(storageMetadata));
    }

    const formHeaders = formData.getHeaders();

    const response = await axios.post(`${process.env.RAG_API_URL}/embed`, formData, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        accept: 'application/json',
        ...formHeaders,
      },
    });

    const responseData = response.data;
    logger.debug('Response from embedding file', responseData);

    if (responseData.known_type === false) {
      throw new Error(`File embedding failed. The filetype ${file.mimetype} is not supported`);
    }

    if (!responseData.status) {
      throw new Error('File embedding failed.');
    }

    return {
      bytes: file.size,
      filename: file.originalname,
      filepath: FileSources.vectordb,
      embedded: Boolean(responseData.known_type),
    };
  } catch (error) {
    logAxiosError({
      error,
      message: 'Error uploading vectors',
    });
    throw new Error(error.message || 'An error occurred during file upload.');
  }
}

module.exports = {
  deleteVectors,
  uploadVectors,
};
