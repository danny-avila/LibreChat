const fs = require('fs');
const { FilePurpose } = require('librechat-data-provider');
const axios = require('axios');
const { getOpenAIClient } = require('../../../controllers/assistants/helpers');
const { logger } = require('~/config');

/**
 *
 * @param {OpenAIClient} openai - The initialized OpenAI client.
 * @returns
 */
async function createVectorStore(openai) {
  try {
    const response = await openai.beta.vectorStores.create({
      name: 'Financial Statements',
    });
    return response.id;
  } catch (error) {
    logger.error('[createVectorStore] Error creating vector store:', error.message);
    throw error;
  }
}

/**
 * Uploads a file to Azure OpenAI Vector Store for file search.
 *
 * @param {Object} params - The parameters for the upload.
 * @param {Express.Multer.File} params.file - The file uploaded to the server via multer.
 * @param {OpenAIClient} params.openai - The initialized OpenAI client.
 * @param {string} [params.vectorStoreId] - The ID of the vector store.
 * @returns {Promise<Object>} The response from Azure containing the file details.
 */
async function uploadToVectorStore({ openai, file, vectorStoreId }) {
  try {
    const filePath = file.path;
    const fileStreams = [fs.createReadStream(filePath)];
    const response = await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStoreId, {
      files: fileStreams,
    });
    logger.debug(
      `[uploadToVectorStore] Successfully uploaded file to Azure Vector Store: ${response.id}`,
    );
    return {
      id: response.vector_store_id,
    };
  } catch (error) {
    logger.error('[uploadToVectorStore] Error uploading file:', error.message);
    throw new Error(`Failed to upload file to Vector Store: ${error.message}`);
  }
}

/**
 * Deletes a file from Azure OpenAI Vector Store.
 *
 * @param {string} file_id - The ID of the file to delete.
 * @param {string} vectorStoreId - The ID of the vector store.
 * @returns {Promise<void>}
 */
async function deleteFromVectorStore(file_id, vectorStoreId) {
  try {
    // Get OpenAI client directly
    const { openai } = await getOpenAIClient();
    const azureOpenAIEndpoint = openai.baseURL;
    const azureOpenAIKey = openai.apiKey;

    const response = await axios.delete(
      `${azureOpenAIEndpoint}/vector_stores/${vectorStoreId}/files/${file_id}?api-version=2024-10-01-preview`,
      {
        headers: {
          'api-key': azureOpenAIKey,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data.deleted) {
      throw new Error(`Failed to delete file ${file_id} from Azure Vector Store`);
    }

    logger.debug(
      `[deleteFromVectorStore] Successfully deleted file ${file_id} from Azure Vector Store`,
    );
  } catch (error) {
    logger.error('[deleteFromVectorStore] Error deleting file:', error.message);
    throw error;
  }
}

module.exports = { uploadToVectorStore, deleteFromVectorStore, createVectorStore };
