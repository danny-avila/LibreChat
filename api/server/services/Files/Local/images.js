const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { updateFile, createFile } = require('~/models');
const { resizeImage } = require('../images/resize');

/**
 * Converts an image file to the WebP format. The function first resizes the image based on the specified
 * resolution.
 *
 * If the original image is already in WebP format, it writes the resized image back. Otherwise,
 * it converts the image to WebP format before saving.
 *
 * The original image is deleted after conversion.
 *
 * @param {Object} req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `imageOutput` path.
 * @param {Express.Multer.File} file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {string} [resolution='high'] - Optional. The desired resolution for the image resizing. Default is 'high'.
 *
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number}>}
 *          A promise that resolves to an object containing:
 *            - filepath: The path where the converted WebP image is saved.
 *            - bytes: The size of the converted image in bytes.
 *            - width: The width of the converted image.
 *            - height: The height of the converted image.
 */
async function convertToWebP(req, file, resolution = 'high') {
  const inputFilePath = file.path;
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const extension = path.extname(inputFilePath);

  const { imageOutput } = req.app.locals.paths;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }

  const newPath = path.join(userPath, path.basename(inputFilePath));

  if (extension.toLowerCase() === '.webp') {
    const bytes = Buffer.byteLength(resizedBuffer);
    await fs.promises.writeFile(newPath, resizedBuffer);
    const filepath = path.posix.join('/', 'images', req.user.id, path.basename(newPath));
    return { filepath, bytes, width, height };
  }

  const outputFilePath = newPath.replace(extension, '.webp');
  const data = await sharp(resizedBuffer).toFormat('webp').toBuffer();
  await fs.promises.writeFile(outputFilePath, data);
  const bytes = Buffer.byteLength(data);
  const filepath = path.posix.join('/', 'images', req.user.id, path.basename(outputFilePath));
  await fs.promises.unlink(inputFilePath);
  return { filepath, bytes, width, height };
}

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
 * Local: Updates the file and encodes the image.
 * @param {Object} req - The request object.
 * @param {MongoFile} file - The file object.
 * @returns {Promise<[MongoFile, string]>}  - A promise that resolves to an array of results from updateFile and encodeImage.
 */
async function encodeLocal(req, file) {
  const { publicPath, imageOutput } = req.app.locals.paths;
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
 * Applies the local strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Express.Multer.File} params.file - The uploaded file.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const saveLocalImage = async ({ req, res, file, metadata }) => {
  const { file_id, temp_file_id } = metadata;
  const { filepath, bytes, width, height } = await convertToWebP(req, file);
  const result = await createFile(
    {
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: file.originalname,
      type: 'image/webp',
      width,
      height,
    },
    true,
  );
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

module.exports = { convertToWebP, encodeImage, encodeLocal, saveLocalImage };
