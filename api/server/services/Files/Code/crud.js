// downloadStream.js

const axios = require('axios');
const { getCodeBaseURL } = require('@librechat/agents');

const baseURL = getCodeBaseURL();

/**
 * Retrieves a download stream for a specified file.
 * @param {string} fileIdentifier - The identifier for the file (e.g., "sessionId/fileId").
 * @param {string} apiKey - The API key for authentication.
 * @returns {Promise<AxiosResponse>} A promise that resolves to a readable stream of the file content.
 * @throws {Error} If there's an error during the download process.
 */
async function getCodeOutputDownloadStream(fileIdentifier, apiKey) {
  try {
    const response = await axios({
      method: 'get',
      url: `${baseURL}/download/${fileIdentifier}`,
      responseType: 'stream',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      timeout: 15000,
    });

    return response;
  } catch (error) {
    throw new Error(`Error downloading file: ${error.message}`);
  }
}

module.exports = { getCodeOutputDownloadStream };
