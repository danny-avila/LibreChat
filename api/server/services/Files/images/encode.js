const { EModelEndpoint, FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('../strategies');

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
