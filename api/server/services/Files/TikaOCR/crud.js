// ~/server/services/Files/TikaOCR/crud.js
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { FileSources, envVarRegex, extractEnvVariable } = require('librechat-data-provider');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { logger, createAxiosInstance } = require('~/config');
const { logAxiosError } = require('~/utils/axios');

const axios = createAxiosInstance();

/**
 * Uploads a document to Tika. DOES NOT FILE STREAM.
 *
 * @param {Object} params Upload parameters
 * @param {string} params.filePath The path to the file on disk
 * @param {string} [params.baseURL=http://tika:9998] Tika API base URL if using docker
 * @returns {Promise<Object>} The response from Tika 
 */
async function uploadDocumentToTika({
  filePath,
  baseURL = 'http://tika:9998',
}) {
  const fileData = fs.readFileSync(filePath); // Read the entire file into memory :(

  return axios
    .put(`${baseURL}/tika`, fileData, {
      headers: {
        'Content-Type': 'application/pdf', // This should be dynamic based on the file type
        'Accept': 'text/plain',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error uploading document to Tika:', error.message);
      throw error;
    });
}

/**
 * Uploads a file to the Tika OCR API and processes the OCR result.
 *
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param {string} params.file_id - The file ID.
 * @param {string} [params.entity_id] - The entity ID, not used here but passed for consistency.
 * @returns {Promise<{ filepath: string, bytes: number }>} - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
const uploadTikaOCR = async ({ req, file, file_id, entity_id }) => {
  try {
    /** @type {TCustomConfig['ocr']} */
    const ocrConfig = req.app.locals?.ocr;

    const baseURLConfig = ocrConfig.baseURL || '';

    const isBaseURLEnvVar = envVarRegex.test(baseURLConfig);

    const isBaseURLEmpty = !baseURLConfig.trim();

    let baseURL;

    if (isBaseURLEnvVar || isBaseURLEmpty) {
      const baseURLVarName = isBaseURLEnvVar ? extractVariableName(baseURLConfig) : 'OCR_BASEURL';

      const authValues = await loadAuthValues({
        userId: req.user.id,
        authFields: [baseURLVarName],
        optional: new Set([baseURLVarName]),
      });

      baseURL = authValues[baseURLVarName];
    } else {  
      baseURL = baseURLConfig;
    }

    const extractedText = await uploadDocumentToTika({
      filePath: file.path,
      baseURL,
    });



    return {
      filename: file.originalname,
      bytes: extractedText.length * 4,
      filepath: FileSources.tika_ocr,
      text: extractedText,
      images: [] // Not used in this implementation
    };
  } catch (error) {
    const message = 'Error uploading document to Tika OCR API';
    throw new Error(logAxiosError({ error, message }));
  }
};

module.exports = {
  uploadTikaOCR
};
