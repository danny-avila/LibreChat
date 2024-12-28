const axios = require('axios');
const {
  FileSources,
  VisionModes,
  ImageDetail,
  ContentTypes,
  EModelEndpoint,
} = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logger } = require('~/config');

/**
 * Fetches a file from a URL and returns its base64 representation.
 *
 * @async
 * @param {string} url The URL of the file.
 * @returns {Promise<string>} The base64-encoded string of the file.
 * @throws {Error} If there's an issue fetching the file or encoding it.
 */
async function fetchFileToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    logger.error('Error fetching file to convert to base64', error);
    throw error;
  }
}

const base64Only = new Set([
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  'Ollama',
  'ollama',
  EModelEndpoint.bedrock,
]);

/**
 * Encodes and formats the given files.
 * @param {Express.Request} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the file.
 * @param {string} [mode] - Optional: The endpoint mode for the file.
 * @returns {Promise<Object>} - A promise that resolves to the result object containing the encoded files and details.
 */
async function encodeAndFormat(req, files, endpoint, mode) {
  const promises = [];
  const encodingMethods = {};
  const result = {
    files: [],
    image_urls: [],
  };

  if (!files || !files.length) {
    return result;
  }

  for (let file of files) {
    const source = file.source ?? FileSources.local;

    if (source == FileSources.vectordb) {
      // Do not try to base-64 encode the file if RAG needs to be performed
      promises.push([file, null]);
      continue;
    }

    if (!encodingMethods[source]) {
      const { prepareFilePayload } = getStrategyFunctions(source);
      if (!prepareFilePayload) {
        throw new Error(`Encoding function not implemented for ${source}`);
      }

      encodingMethods[source] = prepareFilePayload;
    }

    const preparePayload = encodingMethods[source];

    /* Google & Anthropic don't support passing URLs to payload */
    if (source !== FileSources.local && base64Only.has(endpoint)) {
      const [_file, fileURL] = await preparePayload(req, file);
      promises.push([_file, await fetchFileToBase64(fileURL)]);
      continue;
    }
    promises.push(preparePayload(req, file));
  }

  const detail = req.body.imageDetail ?? ImageDetail.auto;

  /** @type {Array<[MongoFile, string]>} */
  const formattedFiles = await Promise.all(promises);

  for (const [file, fileContent] of formattedFiles) {
    const fileMetadata = {
      type: file.type,
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      embedded: !!file.embedded,
      metadata: file.metadata,
    };

    // Propagate width and height for images
    if (file.height && file.width) {
      fileMetadata.height = file.height;
      fileMetadata.width = file.width;
    }

    if (!fileContent) {
      result.files.push(fileMetadata);
      continue;
    }

    const filePart = {
      type: ContentTypes.IMAGE_URL,
    };

    const validEndpoint = endpoint && mode !== VisionModes.agents;
    const dataURL = fileContent.startsWith('http')
      ? fileContent
      : `data:${file.type};base64,${fileContent}`;

    if (validEndpoint && endpoint === EModelEndpoint.google && mode === VisionModes.generative) {
      filePart.inlineData = {
        mimeType: file.type,
        data: fileContent,
      };
    } else if (validEndpoint && endpoint === EModelEndpoint.google) {
      filePart.image_url = dataURL;
    } else if (validEndpoint && endpoint === EModelEndpoint.anthropic) {
      filePart.type = 'image';
      filePart.source = {
        type: 'base64',
        media_type: file.type,
        data: fileContent,
      };
    } else {
      // Agents and all other endpoints use the default OpenAI image_url format
      filePart.image_url = {
        url: dataURL,
        detail,
      };
    }

    // Add to the result arrays
    result.image_urls.push(filePart);
    result.files.push(fileMetadata);
  }
  return result;
}

module.exports = {
  encodeAndFormat,
};
