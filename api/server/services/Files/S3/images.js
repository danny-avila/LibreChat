const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resizeImageBuffer } = require('../images/resize');
const { updateUser } = require('~/models/userMethods');
const { saveBufferToS3 } = require('./crud');
const { updateFile } = require('~/models/File');
const { logger } = require('~/config');

const defaultBasePath = 'images';

/**
 * Resizes, converts, and uploads an image file to S3.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req - Express request (expects user and app.locals.imageOutputType).
 * @param {Express.Multer.File} params.file - File object from Multer.
 * @param {string} params.file_id - Unique file identifier.
 * @param {any} params.endpoint - Endpoint identifier used in image processing.
 * @param {string} [params.resolution='high'] - Desired image resolution.
 * @param {string} [params.basePath='images'] - Base path in the bucket.
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number }>}
 */
async function uploadImageToS3({
  req,
  file,
  file_id,
  endpoint,
  resolution = 'high',
  basePath = defaultBasePath,
}) {
  try {
    const inputFilePath = file.path;
    const inputBuffer = await fs.promises.readFile(inputFilePath);
    const {
      buffer: resizedBuffer,
      width,
      height,
    } = await resizeImageBuffer(inputBuffer, resolution, endpoint);
    const extension = path.extname(inputFilePath);
    const userId = req.user.id;

    let processedBuffer;
    let fileName = `${file_id}__${path.basename(inputFilePath)}`;
    const targetExtension = `.${req.app.locals.imageOutputType}`;

    if (extension.toLowerCase() === targetExtension) {
      processedBuffer = resizedBuffer;
    } else {
      processedBuffer = await sharp(resizedBuffer)
        .toFormat(req.app.locals.imageOutputType)
        .toBuffer();
      fileName = fileName.replace(new RegExp(path.extname(fileName) + '$'), targetExtension);
      if (!path.extname(fileName)) {
        fileName += targetExtension;
      }
    }

    const downloadURL = await saveBufferToS3({
      userId,
      buffer: processedBuffer,
      fileName,
      basePath,
    });
    await fs.promises.unlink(inputFilePath);
    const bytes = Buffer.byteLength(processedBuffer);
    return { filepath: downloadURL, bytes, width, height };
  } catch (error) {
    logger.error('[uploadImageToS3] Error uploading image to S3:', error.message);
    throw error;
  }
}

/**
 * Updates a file record and returns its signed URL.
 *
 * @param {import('express').Request} req - Express request.
 * @param {Object} file - File metadata.
 * @returns {Promise<[Promise<any>, string]>}
 */
async function prepareImageURLS3(req, file) {
  try {
    const updatePromise = updateFile({ file_id: file.file_id });
    return Promise.all([updatePromise, file.filepath]);
  } catch (error) {
    logger.error('[prepareImageURLS3] Error preparing image URL:', error.message);
    throw error;
  }
}

/**
 * Uploads a user's avatar to S3 bucket and returns the URL.
 * If the 'manual' flag is set to 'true', it also updates the user's avatar URL in the database.
 * @param {object} params - The parameters object.
 * @param {Buffer} params.buffer - The Buffer containing the avatar image.
 * @param {string} params.userId - The user ID.
 * @param {string} params.manual - A string flag indicating whether the update is manual ('true' or 'false').
 * @returns {Promise<string>} - A promise that resolves with the URL of the uploaded avatar.
 * @throws {Error} - Throws an error if Firebase is not initialized or if there is an error in uploading.
 */
async function processS3Avatar({ buffer, userId, manual=false }) {
  try {
    // Upload avatar to S3
    let avatarName = 'avatar.png';
    const downloadURL = await saveBufferToS3({
      userId,
      buffer,
      fileName: avatarName,
    });
    const avatarUrl = `${avatarName}?manual=${manual}`;
    // if it's manual update save into database and return download url for immediate display
    if (manual === 'true') {
      await updateUser(userId, { avatar: avatarUrl });
      return downloadURL;
    }
    // otherwise return avatarurl saved into database
    return avatarUrl;
  } catch (error) {
    logger.error('Error uploading profile picture:', error);
    throw error;
  }
}

module.exports = {
  uploadImageToS3,
  prepareImageURLS3,
  processS3Avatar,
};
