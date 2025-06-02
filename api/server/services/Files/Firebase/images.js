const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { logger } = require('@librechat/data-schemas');
const { resizeImageBuffer } = require('../images/resize');
const { updateUser, updateFile } = require('~/models');
const { saveBufferToFirebase } = require('./crud');

/**
 * Converts an image file to the target format. The function first resizes the image based on the specified
 * resolution.
 *
 * @param {Object} params - The params object.
 * @param {Express.Request} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `imageOutput` path.
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {EModelEndpoint} params.endpoint - The params object.
 * @param {string} [params.resolution='high'] - Optional. The desired resolution for the image resizing. Default is 'high'.
 *
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number}>}
 *          A promise that resolves to an object containing:
 *            - filepath: The path where the converted image is saved.
 *            - bytes: The size of the converted image in bytes.
 *            - width: The width of the converted image.
 *            - height: The height of the converted image.
 */
async function uploadImageToFirebase({ req, file, file_id, endpoint, resolution = 'high' }) {
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
    // Replace or append the correct extension
    const extRegExp = new RegExp(path.extname(fileName) + '$');
    fileName = fileName.replace(extRegExp, targetExtension);
    if (!path.extname(fileName)) {
      fileName += targetExtension;
    }
  }

  const downloadURL = await saveBufferToFirebase({ userId, buffer: webPBuffer, fileName });

  await fs.promises.unlink(inputFilePath);

  const bytes = Buffer.byteLength(webPBuffer);
  return { filepath: downloadURL, bytes, width, height };
}

/**
 * Local: Updates the file and returns the URL in expected order/format
 * for image payload handling: tuple order of [filepath, URL].
 * @param {Object} req - The request object.
 * @param {MongoFile} file - The file object.
 * @returns {Promise<[MongoFile, string]>} - A promise that resolves to an array of results from updateFile and encodeImage.
 */
async function prepareImageURL(req, file) {
  const { filepath } = file;
  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));
  promises.push(filepath);
  return await Promise.all(promises);
}

/**
 * Uploads a user's avatar to Firebase Storage and returns the URL.
 * If the 'manual' flag is set to 'true', it also updates the user's avatar URL in the database.
 *
 * @param {object} params - The parameters object.
 * @param {Buffer} params.buffer - The Buffer containing the avatar image.
 * @param {string} params.userId - The user ID.
 * @param {string} params.manual - A string flag indicating whether the update is manual ('true' or 'false').
 * @returns {Promise<string>} - A promise that resolves with the URL of the uploaded avatar.
 * @throws {Error} - Throws an error if Firebase is not initialized or if there is an error in uploading.
 */
async function processFirebaseAvatar({ buffer, userId, manual }) {
  try {
    const downloadURL = await saveBufferToFirebase({
      userId,
      buffer,
      fileName: 'avatar.png',
    });

    const isManual = manual === 'true';

    const url = `${downloadURL}?manual=${isManual}`;

    if (isManual) {
      await updateUser(userId, { avatar: url });
    }

    return url;
  } catch (error) {
    logger.error('Error uploading profile picture:', error);
    throw error;
  }
}

module.exports = { uploadImageToFirebase, prepareImageURL, processFirebaseAvatar };
