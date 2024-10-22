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
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the image.
 * @param {string} [mode] - Optional: The endpoint mode for the image.
 * @returns {Promise<Object>} - A promise that resolves to the result object containing the encoded images and file details.
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

    if (!base64Only.has(endpoint) && !file.height) {
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
    const outputPaths = {
      publicPath: req.app.locals.paths.publicPath,
      fileOutput: file.height ? req.app.locals.paths.imageOutput: req.app.locals.paths.filesOutput,
    };
    if (source !== FileSources.local && base64Only.has(endpoint)) {

      const [_file, fileUrl] = await preparePayload(req, file, outputPaths);
      promises.push([_file, await fetchFileToBase64(fileUrl)]);
      continue;
    }
    promises.push(preparePayload(req, file, outputPaths));
  }

  const detail = req.body.imageDetail ?? ImageDetail.auto;

  /** @type {Array<[MongoFile, string]>} */
  const formattedImages = await Promise.all(promises);

  for (const [file, imageContent] of formattedImages) {
    const fileMetadata = {
      type: file.type,
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      embedded: !!file.embedded,
    };

    if (file.height && file.width) {
      fileMetadata.height = file.height;
      fileMetadata.width = file.width;
    }

    if (!imageContent) {
      result.files.push(fileMetadata);
      continue;
    }

    const imagePart = {
      type: ContentTypes.IMAGE_URL,
      image_url: {
        url: imageContent.startsWith('http')
          ? imageContent
          : `data:${file.type};base64,${imageContent}`,
        detail,
      },
    };

    if (mode === VisionModes.agents) {
      result.image_urls.push(imagePart);
      result.files.push(fileMetadata);
      continue;
    }

    if (endpoint && endpoint === EModelEndpoint.google && mode === VisionModes.generative) {
      delete imagePart.image_url;
      imagePart.inlineData = {
        mimeType: file.type,
        data: imageContent,
      };
    } else if (endpoint && endpoint === EModelEndpoint.google) {
      imagePart.image_url = imagePart.image_url.url;
    } else if (endpoint && endpoint === EModelEndpoint.anthropic) {
      imagePart.type = 'image';
      imagePart.source = {
        type: 'base64',
        media_type: file.type,
        data: imageContent,
      };
      delete imagePart.image_url;
    }

    result.image_urls.push(imagePart);
    result.files.push(fileMetadata);
  }
  return result;
}

module.exports = {
  encodeAndFormat,
};
