const axios = require('axios');
const { EModelEndpoint, FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('../strategies');
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

const base64Only = new Set([EModelEndpoint.google, EModelEndpoint.anthropic]);

/**
 * Encodes and formats the given files.
 * @param {Express.Request} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the image.
 * @returns {Promise<Object>} - A promise that resolves to the result object containing the encoded images and file details.
 */
async function encodeAndFormat(req, files, endpoint) {
  const promises = [];
  const encodingMethods = {};

  for (let file of files) {
    const source = file.source ?? FileSources.local;

    if (encodingMethods[source]) {
      promises.push(encodingMethods[source](req, file));
      continue;
    }

    const { prepareImagePayload } = getStrategyFunctions(source);
    if (!prepareImagePayload) {
      throw new Error(`Encoding function not implemented for ${source}`);
    }

    encodingMethods[source] = prepareImagePayload;

    /* Google doesn't support passing URLs to payload */
    if (source !== FileSources.local && base64Only.has(endpoint)) {
      const [_file, imageURL] = await prepareImagePayload(req, file);
      promises.push([_file, await fetchImageToBase64(imageURL)]);
      continue;
    }
    promises.push(prepareImagePayload(req, file));
  }

  const detail = req.body.imageDetail ?? 'auto';

  /** @type {Array<[MongoFile, string]>} */
  const formattedImages = await Promise.all(promises);

  const result = {
    files: [],
    image_urls: [],
  };

  for (const [file, imageContent] of formattedImages) {
    const imagePart = {
      type: 'image_url',
      image_url: {
        url: imageContent.startsWith('http')
          ? imageContent
          : `data:image/webp;base64,${imageContent}`,
        detail,
      },
    };

    if (endpoint && endpoint === EModelEndpoint.google) {
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

    result.files.push({
      file_id: file.file_id,
      // filepath: file.filepath,
      // filename: file.filename,
      // type: file.type,
      // height: file.height,
      // width: file.width,
    });
  }
  return result;
}

module.exports = {
  encodeAndFormat,
};
