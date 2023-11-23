const path = require('path');
const sharp = require('sharp');
const fs = require('fs').promises;
const { resizeImage } = require('./resize');

async function convertToWebP(file, resolution = 'high') {
  const inputFilePath = file.path;
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const extension = path.extname(inputFilePath);

  if (extension.toLowerCase() === '.webp') {
    const bytes = Buffer.byteLength(resizedBuffer);
    await fs.writeFile(inputFilePath, resizedBuffer);
    const filepath = path.posix.join('/', 'images', 'temp', path.basename(inputFilePath));
    return { filepath, bytes, width, height };
  }

  const outputFilePath = inputFilePath.replace(extension, '.webp');
  const data = await sharp(resizedBuffer).toFormat('webp').toBuffer();
  await fs.writeFile(outputFilePath, data);
  const bytes = Buffer.byteLength(data);
  const filepath = path.posix.join('/', 'images', 'temp', path.basename(outputFilePath));
  await fs.unlink(inputFilePath);
  return { filepath, bytes, width, height };
}

module.exports = { convertToWebP };
