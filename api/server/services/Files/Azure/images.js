const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resizeImageBuffer } = require('../images/resize');
const { updateUser } = require('~/models/userMethods');
const { updateFile } = require('~/models/File');
const { logger } = require('~/config');
const { saveBufferToAzure } = require('./crud');

/**
 * Uploads an image file to Azure Blob Storage.
 * It resizes and converts the image similar to your Firebase implementation.
 *
 * @param {Object} params
 * @param {object} params.req - The Express request object.
 * @param {Express.Multer.File} params.file - The file object.
 * @param {string} params.file_id - The file id.
 * @param {EModelEndpoint} params.endpoint - The endpoint parameters.
 * @param {string} [params.resolution='high'] - The image resolution.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number }>}
 */
async function uploadImageToAzure({
  req,
  file,
  file_id,
  endpoint,
  resolution = 'high',
  basePath = 'images',
  containerName,
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
    let webPBuffer;
    let fileName = `${file_id}__${path.basename(inputFilePath)}`;
    const targetExtension = `.${req.app.locals.imageOutputType}`;

    if (extension.toLowerCase() === targetExtension) {
      webPBuffer = resizedBuffer;
    } else {
      webPBuffer = await sharp(resizedBuffer).toFormat(req.app.locals.imageOutputType).toBuffer();
      const extRegExp = new RegExp(path.extname(fileName) + '$');
      fileName = fileName.replace(extRegExp, targetExtension);
      if (!path.extname(fileName)) {
        fileName += targetExtension;
      }
    }
    const downloadURL = await saveBufferToAzure({
      userId,
      buffer: webPBuffer,
      fileName,
      basePath,
      containerName,
    });
    await fs.promises.unlink(inputFilePath);
    const bytes = Buffer.byteLength(webPBuffer);
    return { filepath: downloadURL, bytes, width, height };
  } catch (error) {
    logger.error('[uploadImageToAzure] Error uploading image:', error);
    throw error;
  }
}

/**
 * Prepares the image URL and updates the file record.
 *
 * @param {object} req - The Express request object.
 * @param {MongoFile} file - The file object.
 * @returns {Promise<[MongoFile, string]>}
 */
async function prepareAzureImageURL(req, file) {
  const { filepath } = file;
  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));
  promises.push(filepath);
  return await Promise.all(promises);
}

/**
 * Uploads and processes a user's avatar to Azure Blob Storage.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - The avatar image buffer.
 * @param {string} params.userId - The user's id.
 * @param {string} params.manual - Flag to indicate manual update.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The URL of the avatar.
 */
async function processAzureAvatar({ buffer, userId, manual, basePath = 'images', containerName }) {
  try {
    const downloadURL = await saveBufferToAzure({
      userId,
      buffer,
      fileName: 'avatar.png',
      basePath,
      containerName,
    });
    const isManual = manual === 'true';
    const url = `${downloadURL}?manual=${isManual}`;
    if (isManual) {
      await updateUser(userId, { avatar: url });
    }
    return url;
  } catch (error) {
    logger.error('[processAzureAvatar] Error uploading profile picture to Azure:', error);
    throw error;
  }
}

module.exports = {
  uploadImageToAzure,
  prepareAzureImageURL,
  processAzureAvatar,
};
