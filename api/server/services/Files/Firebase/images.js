const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { saveBufferToFirebase } = require('./crud');
const { resizeImage } = require('../images/resize');

/**
 * Converts an image file to the WebP format. The function first resizes the image based on the specified
 * resolution.
 *
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
async function uploadImageToFirebase(req, file, resolution = 'high') {
  const inputFilePath = file.path;
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const extension = path.extname(inputFilePath);
  const userId = req.user.id;

  let webPBuffer;
  let fileName = path.basename(inputFilePath);
  if (extension.toLowerCase() === '.webp') {
    webPBuffer = resizedBuffer;
  } else {
    webPBuffer = await sharp(resizedBuffer).toFormat('webp').toBuffer();
    // Replace or append the correct extension
    const extRegExp = new RegExp(path.extname(fileName) + '$');
    fileName = fileName.replace(extRegExp, '.webp');
    if (!path.extname(fileName)) {
      fileName += '.webp';
    }
  }

  const downloadURL = await saveBufferToFirebase({ userId, buffer: webPBuffer, fileName });

  await fs.promises.unlink(inputFilePath);

  const bytes = Buffer.byteLength(webPBuffer);
  return { filepath: downloadURL, bytes, width, height };
}

module.exports = { uploadImageToFirebase };
