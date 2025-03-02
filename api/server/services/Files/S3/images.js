const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resizeImageBuffer } = require('../images/resize');
const { updateUser } = require('~/models/userMethods');
const { saveBufferToS3 } = require('./crud');
const { updateFile } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Resizes, converts, and uploads an image file to S3.
 *
 * @param {Object} params - The parameters object.
 * @param {import('express').Request} params.req - The Express request object. Expects `user` and `app.locals.imageOutputType`.
 * @param {Express.Multer.File} params.file - The file object from Multer with a `path` property.
 * @param {string} params.file_id - The unique file identifier.
 * @param {any} params.endpoint - An endpoint identifier used in image processing.
 * @param {string} [params.resolution='high'] - The desired image resolution.
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number }>} A promise that resolves to the image details.
 * @throws {Error} Throws error if processing or upload fails.
 */
async function uploadImageToS3({ req, file, file_id, endpoint, resolution = 'high' }) {
  const inputFilePath = file.path;
  const inputBuffer = await fs.promises.readFile(inputFilePath);
  const {
    buffer: resizedBuffer,
    width,
    height,
  } = await resizeImageBuffer(inputBuffer, resolution, endpoint);
  const extension = path.extname(inputFilePath);
  const userId = req.user.id;

  let webPBuffer;
  let fileName = `${file_id}__${path.basename(inputFilePath)}`;
  const targetExtension = `.${req.app.locals.imageOutputType}`;

  if (extension.toLowerCase() === targetExtension) {
    webPBuffer = resizedBuffer;
  } else {
    webPBuffer = await sharp(resizedBuffer).toFormat(req.app.locals.imageOutputType).toBuffer();
    fileName = fileName.replace(new RegExp(path.extname(fileName) + '$'), targetExtension);
    if (!path.extname(fileName)) {
      fileName += targetExtension;
    }
  }

  const downloadURL = await saveBufferToS3({ userId, buffer: webPBuffer, fileName });
  await fs.promises.unlink(inputFilePath);

  const bytes = Buffer.byteLength(webPBuffer);
  return { filepath: downloadURL, bytes, width, height };
}

/**
 * Updates a file record and returns its signed URL.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Object} file - The file object containing file metadata.
 * @returns {Promise<[Promise<any>, string]>} A promise that resolves to an array with the update result and the file URL.
 */
async function prepareImageURLS3(req, file) {
  const { filepath } = file;
  const updatePromise = updateFile({ file_id: file.file_id });
  return Promise.all([updatePromise, filepath]);
}

/**
 * Uploads a user's avatar image to S3 and updates the user's avatar URL if manual flag is true.
 *
 * @param {Object} params - The parameters object.
 * @param {Buffer} params.buffer - The avatar image buffer.
 * @param {string} params.userId - The user ID.
 * @param {string} params.manual - A string flag ('true' or 'false') indicating if the update is manual.
 * @returns {Promise<string>} A promise that resolves to the signed URL of the uploaded avatar.
 * @throws {Error} Throws error if upload or update fails.
 */
async function processS3Avatar({ buffer, userId, manual }) {
  try {
    const downloadURL = await saveBufferToS3({
      userId,
      buffer,
      fileName: 'avatar.png',
    });

    if (manual === 'true') {
      await updateUser(userId, { avatar: downloadURL });
    }
    return downloadURL;
  } catch (error) {
    logger.error('Error uploading profile picture:', error);
    throw error;
  }
}

module.exports = { uploadImageToS3, prepareImageURLS3, processS3Avatar };
