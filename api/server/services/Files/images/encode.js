const fs = require('fs');
const path = require('path');
const { EModelEndpoint } = require('librechat-data-provider');
const { updateFile } = require('~/models');

/**
 * Encodes an image file to base64.
 * @param {string} imagePath - The path to the image file.
 * @returns {Promise<string>} A promise that resolves with the base64 encoded image data.
 */
function encodeImage(imagePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(imagePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString('base64'));
      }
    });
  });
}

/**
 * Updates the file and encodes the image.
 * @param {Object} req - The request object.
 * @param {Object} file - The file object.
 * @returns {Promise<[MongoFile, string]>}  - A promise that resolves to an array of results from updateFile and encodeImage.
 */
async function updateAndEncode(req, file) {
  const { publicPath, imageOutput } = req.app.locals.config;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  const filepath = path.join(publicPath, file.filepath);

  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));
  promises.push(encodeImage(filepath));
  return await Promise.all(promises);
}

/**
 * Encodes and formats the given files.
 * @param {Express.Request} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the image.
 * @returns {Promise<Object>} - A promise that resolves to the result object containing the encoded images and file details.
 */
async function encodeAndFormat(req, files, endpoint) {
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
      filepath: file.filepath,
      filename: file.filename,
      type: file.type,
      height: file.height,
      width: file.width,
    });
  }
  return result;
}

module.exports = {
  encodeImage,
  encodeAndFormat,
};
