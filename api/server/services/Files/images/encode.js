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
 * Fetches an image from a URL and returns its base64 representation.
 *
 * @async
 * @param {string} url The URL of the image.
 * @returns {Promise<string>} The base64-encoded string of the image.
 * @throws {Error} If there's an issue fetching the image or encoding it.
 */
async function fetchImageToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    logger.error('Error fetching image to convert to base64', error);
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
    text: '',
    files: [],
    image_urls: [],
  };

  if (!files || !files.length) {
    return result;
  }

  for (let file of files) {
    const source = file.source ?? FileSources.local;
    if (source === FileSources.text && file.text) {
      result.text += `${!result.text ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${file.text}\n`;
    }

    if (!file.height) {
      promises.push([file, null]);
      continue;
    }

    if (!encodingMethods[source]) {
      const { prepareImagePayload } = getStrategyFunctions(source);
      if (!prepareImagePayload) {
        throw new Error(`Encoding function not implemented for ${source}`);
      }

      encodingMethods[source] = prepareImagePayload;
    }

    const preparePayload = encodingMethods[source];

    /* Google & Anthropic don't support passing URLs to payload */
    if (source !== FileSources.local && base64Only.has(endpoint)) {
      const [_file, imageURL] = await preparePayload(req, file);
      promises.push([_file, await fetchImageToBase64(imageURL)]);
      continue;
    }
    promises.push(preparePayload(req, file));
  }

  if (result.text) {
    result.text += '\n```';
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
      metadata: file.metadata,
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
