const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { logAxiosError, generateShortLivedToken } = require('@librechat/api');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const VECTOR_UPLOAD_MAX_ATTEMPTS = parsePositiveInt(process.env.VECTOR_UPLOAD_MAX_ATTEMPTS, 3);
const VECTOR_UPLOAD_RETRY_DELAY_MS = parsePositiveInt(
  process.env.VECTOR_UPLOAD_RETRY_DELAY_MS,
  1000,
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryUpload = (error) => {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  const status = error.response.status;
  return status >= 500 && status < 600;
};

/**
 * Deletes a file from the vector database. This function takes a file object, constructs the full path, and
 * verifies the path's validity before deleting the file. If the path is invalid, an error is thrown.
 *
 * @param {ServerRequest} req - The request object from Express.
 * @param {MongoFile} file - The file object to be deleted. It should have a `filepath` property that is
 *                           a string representing the path of the file relative to the publicPath.
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the file has been successfully deleted, or throws an error if the
 *          file path is invalid or if there is an error in deletion.
 */
const deleteVectors = async (req, file) => {
  if (!file.embedded || !process.env.RAG_API_URL) {
    return;
  }
  try {
    const jwtToken = generateShortLivedToken(req.user.id);

    return await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      data: [file.file_id],
    });
  } catch (error) {
    logAxiosError({
      error,
      message: 'Error deleting vectors',
    });
    if (
      error.response &&
      error.response.status !== 404 &&
      (error.response.status < 200 || error.response.status >= 300)
    ) {
      logger.warn('Error deleting vectors, file will not be deleted');
      throw new Error(error.message || 'An error occurred during file deletion.');
    }
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
async function uploadVectors({
  req,
  file,
  file_id,
  entity_id,
  storageMetadata,
  parsedText,
  parsedTextChunks,
}) {
  if (!process.env.RAG_API_URL) {
    throw new Error('RAG_API_URL not defined');
  }

  try {
    const jwtToken = generateShortLivedToken(req.user.id);

    const buildFormData = () => {
      const formData = new FormData();
      formData.append('file_id', file_id);
      formData.append('file', fs.createReadStream(file.path));
      if (entity_id != null && entity_id) {
        formData.append('entity_id', entity_id);
      }

      if (storageMetadata) {
        formData.append('storage_metadata', JSON.stringify(storageMetadata));
      }

      if (parsedText) {
        formData.append('parsed_text', JSON.stringify(parsedText));
      }

      if (parsedTextChunks?.length) {
        formData.append('parsed_text_chunks', JSON.stringify(parsedTextChunks));
      }

      return formData;
    };

    const attemptUpload = async () => {
      let lastError;
      for (let attempt = 1; attempt <= VECTOR_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
        const formData = buildFormData();
        const formHeaders = formData.getHeaders();
        try {
          const response = await axios.post(`${process.env.RAG_API_URL}/embed`, formData, {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              accept: 'application/json',
              ...formHeaders,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
          return response;
        } catch (error) {
          lastError = error;

          if (attempt === VECTOR_UPLOAD_MAX_ATTEMPTS || !shouldRetryUpload(error)) {
            throw lastError;
          }

          await wait(VECTOR_UPLOAD_RETRY_DELAY_MS * attempt);
        }
      }
      throw lastError; // should never happen but satisfies linting
    };

    const response = await attemptUpload();
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
