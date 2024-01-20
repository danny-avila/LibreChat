const sharp = require('sharp');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const User = require('~/models/User');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logger } = require('~/config');

async function convertToWebP(inputBuffer) {
  return sharp(inputBuffer).resize({ width: 150 }).toFormat('webp').toBuffer();
}

/**
 * Uploads an avatar image for a user. This function can handle various types of input (URL, Buffer, or File object),
 * processes the image to a square format, converts it to WebP format, and then uses a specified file strategy for
 * further processing. It performs validation on the user ID and the input type. The function can throw errors for
 * invalid input types, fetching issues, or other processing errors.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier of the user for whom the avatar is being uploaded.
 * @param {FileSources} params.fileStrategy - The file handling strategy to use, determining how the avatar is processed.
 * @param {(string|Buffer|File)} params.input - The input representing the avatar image. Can be a URL (string),
 *                                               a Buffer, or a File object.
 * @param {string} params.manual - A string flag indicating whether the upload process is manual.
 *
 * @returns {Promise<any>}
 *          A promise that resolves to the result of the `processAvatar` function, specific to the chosen file
 *          strategy. Throws an error if any step in the process fails.
 *
 * @throws {Error} Throws an error if the user ID is undefined, the input type is invalid, the image fetching fails,
 *                 or any other error occurs during the processing.
 */
async function uploadAvatar({ userId, fileStrategy, input, manual }) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }
    const _id = userId;
    // TODO: remove direct use of Model, `User`
    const oldUser = await User.findOne({ _id });

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

    const { width, height } = await sharp(imageBuffer).metadata();
    const minSize = Math.min(width, height);
    const squaredBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor((width - minSize) / 2),
        top: Math.floor((height - minSize) / 2),
        width: minSize,
        height: minSize,
      })
      .toBuffer();

    const webPBuffer = await convertToWebP(squaredBuffer);
    const { processAvatar } = getStrategyFunctions(fileStrategy);
    return await processAvatar({ buffer: webPBuffer, User: oldUser, manual });
  } catch (error) {
    logger.error('Error uploading the avatar:', error);
    throw error;
  }
}

module.exports = uploadAvatar;
