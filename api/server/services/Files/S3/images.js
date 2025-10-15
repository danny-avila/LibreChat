const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { logger } = require('@librechat/data-schemas');
const { resizeImageBuffer } = require('../images/resize');
const { updateUser, updateFile } = require('~/models');
const { saveBufferToS3 } = require('./crud');

const defaultBasePath = 'images';

/**
 * Resizes, converts, and uploads an image file to S3.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req - Express request (expects `user` and `appConfig.imageOutputType`).
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
    const appConfig = req.config;
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
    const targetExtension = `.${appConfig.imageOutputType}`;

    if (extension.toLowerCase() === targetExtension) {
      processedBuffer = resizedBuffer;
    } else {
      processedBuffer = await sharp(resizedBuffer).toFormat(appConfig.imageOutputType).toBuffer();
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
 * Processes a user's avatar image by uploading it to S3 and updating the user's avatar URL if required.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Avatar image buffer.
 * @param {string} params.userId - User's unique identifier.
 * @param {string} params.manual - 'true' or 'false' flag for manual update.
 * @param {string} [params.agentId] - Optional agent ID if this is an agent avatar.
 * @param {string} [params.basePath='images'] - Base path in the bucket.
 * @returns {Promise<string>} Signed URL of the uploaded avatar.
 */
async function processS3Avatar({ buffer, userId, manual, agentId, basePath = defaultBasePath }) {
  try {
    const metadata = await sharp(buffer).metadata();
    const extension = metadata.format === 'gif' ? 'gif' : 'png';
    const timestamp = new Date().getTime();

    /** Unique filename with timestamp and optional agent ID */
    const fileName = agentId
      ? `agent-${agentId}-avatar-${timestamp}.${extension}`
      : `avatar-${timestamp}.${extension}`;

    const downloadURL = await saveBufferToS3({ userId, buffer, fileName, basePath });

    // Only update user record if this is a user avatar (manual === 'true')
    if (manual === 'true' && !agentId) {
      await updateUser(userId, { avatar: downloadURL });
    }

    return downloadURL;
  } catch (error) {
    logger.error('[processS3Avatar] Error processing S3 avatar:', error.message);
    throw error;
  }
}

module.exports = {
  uploadImageToS3,
  prepareImageURLS3,
  processS3Avatar,
};
