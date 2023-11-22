const path = require('path');
const sharp = require('sharp');
const fs = require('fs').promises;
const { resizeImage } = require('./resize');

async function convertToWebP(inputFilePath, resolution = 'high') {
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const outputFilePath = inputFilePath.replace(/\.[^/.]+$/, '') + '.webp';
  const data = await sharp(resizedBuffer).toFormat('webp').toBuffer();
  await fs.writeFile(outputFilePath, data);
  const bytes = Buffer.byteLength(data);
  const filepath = path.posix.join('/', 'images', 'temp', path.basename(outputFilePath));
  await fs.unlink(inputFilePath);
  return { filepath, bytes, width, height };
}

module.exports = { convertToWebP };
