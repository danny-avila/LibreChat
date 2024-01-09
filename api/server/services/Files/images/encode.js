const { EModelEndpoint, FileSources } = require('librechat-data-provider');
const { encodeLocal } = require('../Local/images');

const encodeStrategies = {
  [FileSources.local]: encodeLocal,
};

/**
 * Encodes and formats the given files.
 * @param {Express.Request} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the image.
 * @returns {Promise<Object>} - A promise that resolves to the result object containing the encoded images and file details.
 */
async function encodeAndFormat(req, files, endpoint) {
  const { fileStrategy } = req.app.locals;
  /**
   * @type {function(Express.Request, MongoFile): Promise<[MongoFile, string]>}
   */
  const updateAndEncode = encodeStrategies[fileStrategy];

  const promises = [];
  for (let file of files) {
    promises.push(updateAndEncode(req, file));
  }

  // TODO: make detail configurable, as of now resizing is done
  // to prefer "high" but "low" may be used if the image is small enough
  const detail = req.body.detail ?? 'auto';
  const encodedImages = await Promise.all(promises);

  const result = {
    files: [],
    image_urls: [],
  };

  for (const [file, base64] of encodedImages) {
    const imagePart = {
      type: 'image_url',
      image_url: {
        url: `data:image/webp;base64,${base64}`,
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
