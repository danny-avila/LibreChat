const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resizeImageBuffer } = require('./resize');

/**
 * Converts an image file or buffer to WebP format with specified resolution.
 *
 * @param {object} req - The request object, containing user and app configuration data.
 * @param {object} file - The file object, containing either a path or a buffer.
 * @param {'low' | 'high'} [resolution='high'] - The desired resolution for the output image.
 * @param {string} [ext='.png'] - The extension of the input file, if it is a buffer.
 * @returns {Promise<{filepath: string, bytes: number, width: number, height: number}>} An object containing the path, size, and dimensions of the converted image.
 * @throws Throws an error if there is an issue during the conversion process.
 */
async function convertToWebP(req, file, resolution = 'high', ext = '.png') {
  try {
    let inputBuffer;

    // Check if the input is a buffer or a file path
    if (Buffer.isBuffer(file)) {
      inputBuffer = file;
    } else if (file && file.path) {
      const inputFilePath = file.path;
      inputBuffer = await fs.promises.readFile(inputFilePath);
    } else {
      throw new Error('Invalid input: file must be a buffer or contain a valid path.');
    }

    const {
      buffer: resizedBuffer,
      width,
      height,
    } = await resizeImageBuffer(inputBuffer, resolution);

    const extension = file.path ? path.extname(file.path) : ext; // Default extension if input is a buffer
    const { imageOutput } = req.app.locals.config;
    const userPath = path.join(imageOutput, req.user.id);

    if (!fs.existsSync(userPath)) {
      fs.mkdirSync(userPath, { recursive: true });
    }

    // Generate a new path for the output file
    const newFileName = file.path ? path.basename(file.path) : `image-${Date.now()}.webp`;
    const newPath = path.join(userPath, newFileName);

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

    if (file.path) {
      // Delete the original file if it was a file path
      await fs.promises.unlink(file.path);
    }

    return { filepath, bytes, width, height };
  } catch (err) {
    console.error(err);
    throw err;
  }
}

module.exports = { convertToWebP };
