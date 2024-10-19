// Code Files
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { getCodeBaseURL } = require('@librechat/agents');

const MAX_FILE_SIZE = 25 * 1024 * 1024;

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

/**
 * Uploads a file to the Code Environment server.
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `uploads` path.
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {string} params.apiKey - The API key for authentication.
 * @returns {Promise<string>}
 * @throws {Error} If there's an error during the upload process.
 */
async function uploadCodeEnvFile({ req, file, apiKey }) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), file.originalname);

    const baseURL = getCodeBaseURL();
    const response = await axios.post(`${baseURL}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
        'User-Agent': 'LibreChat/1.0',
        'User-Id': req.user.id,
        'X-API-Key': apiKey,
      },
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    });

    /** @type {{ message: string; session_id: string; files: Array<{ fileId: string; filename: string }> }} */
    const result = response.data;
    if (result.message !== 'success') {
      throw new Error(`Error uploading file: ${result.message}`);
    }

    return `${result.session_id}/${result.files[0].fileId}`;
  } catch (error) {
    throw new Error(`Error uploading file: ${error.message}`);
  }
}

module.exports = { getCodeOutputDownloadStream, uploadCodeEnvFile };
