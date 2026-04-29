const FormData = require('form-data');
const { logger } = require('@librechat/data-schemas');
const { getCodeBaseURL } = require('@librechat/agents');
const {
  appendCodeEnvFile,
  logAxiosError,
  createAxiosInstance,
  codeServerHttpAgent,
  codeServerHttpsAgent,
} = require('@librechat/api');

const axios = createAxiosInstance();

const MAX_FILE_SIZE = 150 * 1024 * 1024;

/**
 * Retrieves a download stream for a specified file.
 * @param {string} fileIdentifier - The identifier for the file (e.g., "session_id/fileId").
 * @returns {Promise<AxiosResponse>} A promise that resolves to a readable stream of the file content.
 * @throws {Error} If there's an error during the download process.
 */
async function getCodeOutputDownloadStream(fileIdentifier) {
  try {
    const baseURL = getCodeBaseURL();
    /** @type {import('axios').AxiosRequestConfig} */
    const options = {
      method: 'get',
      url: `${baseURL}/download/${fileIdentifier}`,
      responseType: 'stream',
      headers: {
        'User-Agent': 'LibreChat/1.0',
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    };

    const response = await axios(options);
    return response;
  } catch (error) {
    throw new Error(
      logAxiosError({
        message: `Error downloading code environment file stream: ${error.message}`,
        error,
      }),
    );
  }
}

/**
 * Uploads a file to the Code Environment server.
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object from Express. It should have a `user` property with an `id` representing the user
 * @param {import('fs').ReadStream | import('stream').Readable} params.stream - The read stream for the file.
 * @param {string} params.filename - The name of the file.
 * @param {string} [params.entity_id] - Optional entity ID for the file.
 * @returns {Promise<string>}
 * @throws {Error} If there's an error during the upload process.
 */
async function uploadCodeEnvFile({ req, stream, filename, entity_id = '' }) {
  try {
    const form = new FormData();
    if (entity_id.length > 0) {
      form.append('entity_id', entity_id);
    }
    appendCodeEnvFile(form, stream, filename);

    const baseURL = getCodeBaseURL();
    /** @type {import('axios').AxiosRequestConfig} */
    const options = {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
        'User-Agent': 'LibreChat/1.0',
        'User-Id': req.user.id,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 120000,
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    };

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
    throw new Error(
      logAxiosError({
        message: `Error uploading code environment file: ${error.message}`,
        error,
      }),
    );
  }
}

/**
 * Uploads multiple files to the code execution environment in a single request.
 * Uses the /upload/batch endpoint which shares one session_id across all files.
 *
 * @param {object} params
 * @param {import('express').Request & { user: { id: string } }} params.req - The request object.
 * @param {Array<{ stream: NodeJS.ReadableStream; filename: string }>} params.files - Files to upload.
 * @param {string} [params.entity_id] - Optional entity ID.
 * @param {boolean} [params.read_only] - When true, codeapi tags every file in
 *   the batch as infrastructure (e.g. skill files). The flag is persisted as
 *   MinIO object metadata (`X-Amz-Meta-Read-Only`) and travels with the file
 *   through subsequent download/walk passes — sandboxed-code modifications
 *   are dropped on the floor and the original ref is echoed back as
 *   `inherited: true`, never as a generated artifact.
 * @returns {Promise<{ session_id: string; files: Array<{ fileId: string; filename: string }> }>}
 * @throws {Error} If the batch upload fails entirely.
 */
async function batchUploadCodeEnvFiles({ req, files, entity_id = '', read_only = false }) {
  try {
    const form = new FormData();
    if (entity_id.length > 0) {
      form.append('entity_id', entity_id);
    }
    if (read_only) {
      form.append('read_only', 'true');
    }
    for (const file of files) {
      appendCodeEnvFile(form, file.stream, file.filename);
    }

    const baseURL = getCodeBaseURL();
    /** @type {import('axios').AxiosRequestConfig} */
    const options = {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
        'User-Agent': 'LibreChat/1.0',
        'User-Id': req.user.id,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 120000,
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    };

    const response = await axios.post(`${baseURL}/upload/batch`, form, options);

    /** @type {{ message: string; session_id: string; files: Array<{ status: string; fileId?: string; filename: string; error?: string }>; succeeded: number; failed: number }} */
    const result = response.data;
    if (
      !result ||
      typeof result !== 'object' ||
      !result.session_id ||
      !Array.isArray(result.files)
    ) {
      throw new Error(`Unexpected batch upload response: ${JSON.stringify(result).slice(0, 200)}`);
    }
    if (result.message === 'error') {
      throw new Error('All files in batch upload failed');
    }

    if (result.failed > 0) {
      const failedNames = result.files
        .filter((f) => f.status === 'error')
        .map((f) => `${f.filename}: ${f.error || 'unknown'}`)
        .join(', ');
      logger.warn(`[batchUploadCodeEnvFiles] ${result.failed} file(s) failed: ${failedNames}`);
    }

    const successFiles = result.files
      .filter((f) => f.status === 'success' && f.fileId)
      .map((f) => ({ fileId: f.fileId, filename: f.filename }));

    return { session_id: result.session_id, files: successFiles };
  } catch (error) {
    throw new Error(
      logAxiosError({
        message: `Error in batch upload to code environment: ${error instanceof Error ? error.message : String(error)}`,
        error,
      }),
    );
  }
}

module.exports = { getCodeOutputDownloadStream, uploadCodeEnvFile, batchUploadCodeEnvFiles };
