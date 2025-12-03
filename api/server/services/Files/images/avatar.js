const sharp = require('sharp');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');
const { EImageOutputType } = require('librechat-data-provider');
const { resizeAndConvert } = require('./resize');

/**
 * Uploads an avatar image for a user. This function can handle various types of input (URL, Buffer, or File object),
 * processes the image to a square format, converts it to target format, and returns the resized buffer.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier of the user for whom the avatar is being uploaded.
 * @param {string} options.desiredFormat - The desired output format of the image.
 * @param {(string|Buffer|File)} params.input - The input representing the avatar image. Can be a URL (string),
 *                                               a Buffer, or a File object.
 *
 * @returns {Promise<any>}
 *          A promise that resolves to a resized buffer.
 *
 * @throws {Error} Throws an error if the user ID is undefined, the input type is invalid, the image fetching fails,
 *                 or any other error occurs during the processing.
 */
async function resizeAvatar({ userId, input, desiredFormat = EImageOutputType.PNG }) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }

    let imageBuffer;
    if (typeof input === 'string') {
      const response = await fetch(input);

      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL. Status: ${response.status}`);
      }
      imageBuffer = await response.buffer();
    } else if (input instanceof Buffer) {
      imageBuffer = input;
    } else if (typeof input === 'object' && input instanceof File) {
      const fileContent = await fs.readFile(input.path);
      imageBuffer = Buffer.from(fileContent);
    } else {
      throw new Error('Invalid input type. Expected URL, Buffer, or File.');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    const minSize = Math.min(width, height);

    if (metadata.format === 'gif') {
      const resizedBuffer = await sharp(imageBuffer, { animated: true })
        .extract({
          left: Math.floor((width - minSize) / 2),
          top: Math.floor((height - minSize) / 2),
          width: minSize,
          height: minSize,
        })
        .resize(250, 250)
        .gif()
        .toBuffer();

      return resizedBuffer;
    }

    const squaredBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor((width - minSize) / 2),
        top: Math.floor((height - minSize) / 2),
        width: minSize,
        height: minSize,
      })
      .toBuffer();

    const { buffer } = await resizeAndConvert({
      inputBuffer: squaredBuffer,
      desiredFormat,
    });
    return buffer;
  } catch (error) {
    logger.error('Error uploading the avatar:', error);
    throw error;
  }
}

module.exports = { resizeAvatar };
