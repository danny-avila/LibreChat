const axios = require('axios');
const { EModelEndpoint } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Uploads a file that can be used across various OpenAI services.
 *
 * @param {Express.Request} req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `imageOutput` path.
 * @param {Express.Multer.File} file - The file uploaded to the server via multer.
 * @param {OpenAIClient} openai - The initialized OpenAI client.
 * @returns {Promise<OpenAIFile>}
 */
async function uploadOpenAIFile(req, file, openai) {
  try {
    let url;
    const { apiKey, baseURL, httpAgent, organization } = openai;
    let headers = {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'assistants=v1',
    };

    if (organization) {
      headers['OpenAI-Organization'] = organization;
    }

    const formData = new FormData();
    formData.append('purpose', 'assistants');
    const fileBlob = new Blob([file.buffer], {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    formData.append('file', fileBlob, file.originalname);

    /** @type {TAzureConfig | undefined} */
    const azureConfig = openai.req.app.locals[EModelEndpoint.azureOpenAI];

    if (azureConfig && azureConfig.assistants) {
      delete headers.Authorization;
      headers = {
        ...headers,
        ...openai._options.defaultHeaders,
        'Content-Type': 'multipart/form-data',
      };
      const queryParams = new URLSearchParams(openai._options.defaultQuery).toString();
      url = `${baseURL}/files?${queryParams}`;
    } else {
      url = `${baseURL}/files`;
    }

    const axiosConfig = {
      headers,
      // timeout: timeout,
    };

    if (httpAgent) {
      axiosConfig.httpAgent = httpAgent;
      axiosConfig.httpsAgent = httpAgent;
    }

    const response = await axios.post(url, formData, axiosConfig);
    logger.debug(
      `[uploadOpenAIFile] User ${req.user.id} successfully uploaded file to OpenAI`,
      response.data,
    );
    return response.data;
  } catch (error) {
    const errorData = error?.response?.data?.error;
    const message =
      errorData?.message?.includes('purpose') && openai.locals?.azureOptions
        ? `The file purpose \`assistants\` is invalid. Please ensure your Azure config is using version \`2024-02-15-preview\` or later.\n${errorData?.code}: ${errorData?.message}`
        : error.message + (errorData ? `: ${errorData.code} - ${errorData.message}` : '');
    const errorMessage = '[uploadOpenAIFile] Error uploading file to OpenAI: ' + message;
    throw new Error(errorMessage);
  }
}

/**
 * Deletes a file previously uploaded to OpenAI.
 *
 * @param {Express.Request} req - The request object from Express.
 * @param {MongoFile} file - The database representation of the uploaded file.
 * @param {OpenAI} openai - The initialized OpenAI client.
 * @returns {Promise<void>}
 */
async function deleteOpenAIFile(req, file, openai) {
  try {
    const res = await openai.files.del(file.file_id);
    if (!res.deleted) {
      throw new Error('OpenAI returned `false` for deleted status');
    }
    logger.debug(
      `[deleteOpenAIFile] User ${req.user.id} successfully deleted ${file.file_id} from OpenAI`,
    );
  } catch (error) {
    logger.error('[deleteOpenAIFile] Error deleting file from OpenAI: ' + error.message);
    throw error;
  }
}

module.exports = { uploadOpenAIFile, deleteOpenAIFile };
