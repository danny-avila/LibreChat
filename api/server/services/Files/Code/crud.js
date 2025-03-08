const axios = require('axios');
const FormData = require('form-data');
const { getCodeBaseURL } = require('@librechat/agents');
const { logAxiosError } = require('~/utils');

const MAX_FILE_SIZE = 150 * 1024 * 1024;

/**
 * Retrieves a download stream for a specified file.
 * @param {string} fileIdentifier - The identifier for the file (e.g., "session_id/fileId").
 * @param {string} apiKey - The API key for authentication.
 * @returns {Promise<AxiosResponse>} A promise that resolves to a readable stream of the file content.
 * @throws {Error} If there's an error during the download process.
 */
async function getCodeOutputDownloadStream(fileIdentifier, apiKey) {
  try {
    const baseURL = getCodeBaseURL();
    /** @type {import('axios').AxiosRequestConfig} */
    const options = {
      method: 'get',
      url: `${baseURL}/download/${fileIdentifier}`,
      responseType: 'stream',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      timeout: 15000,
    };

    if (process.env.PROXY) {
      options.proxy = {
        host: process.env.PROXY,
        protocol: process.env.PROXY.startsWith('https') ? 'https' : 'http',
      };
    }

    const response = await axios(options);
    return response;
  } catch (error) {
    logAxiosError({
      message: `Error downloading code environment file stream: ${error.message}`,
      error,
    });
    throw new Error(`Error downloading file: ${error.message}`);
  }
}

/**
 * Uploads a file to the Code Environment server.
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `uploads` path.
 * @param {import('fs').ReadStream | import('stream').Readable} params.stream - The read stream for the file.
 * @param {string} params.filename - The name of the file.
 * @param {string} params.apiKey - The API key for authentication.
 * @param {string} [params.entity_id] - Optional entity ID for the file.
 * @returns {Promise<string>}
 * @throws {Error} If there's an error during the upload process.
 */
async function uploadCodeEnvFile({ req, stream, filename, apiKey, entity_id = '' }) {
  try {
    const form = new FormData();
    if (entity_id.length > 0) {
      form.append('entity_id', entity_id);
    }
    form.append('file', stream, filename);

    const baseURL = getCodeBaseURL();
    /** @type {import('axios').AxiosRequestConfig} */
    const options = {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
        'User-Agent': 'LibreChat/1.0',
        'User-Id': req.user.id,
        'X-API-Key': apiKey,
      },
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    };

    if (process.env.PROXY) {
      options.proxy = {
        host: process.env.PROXY,
        protocol: process.env.PROXY.startsWith('https') ? 'https' : 'http',
      };
    }

    const response = await axios.post(`${baseURL}/upload`, form, options);

    /** @type {{ message: string; session_id: string; files: Array<{ fileId: string; filename: string }> }} */
    const result = response.data;
    if (result.message !== 'success') {
      throw new Error(`Error uploading file: ${result.message}`);
    }

    const fileIdentifier = `${result.session_id}/${result.files[0].fileId}`;
    if (entity_id.length === 0) {
      return fileIdentifier;
    }

    return `${fileIdentifier}?entity_id=${entity_id}`;
  } catch (error) {
    logAxiosError({
      message: `Error uploading code environment file: ${error.message}`,
      error,
    });
    throw new Error(`Error uploading code environment file: ${error.message}`);
  }
}

module.exports = { getCodeOutputDownloadStream, uploadCodeEnvFile };
