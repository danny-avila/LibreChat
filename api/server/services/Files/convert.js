const sharp = require('sharp');
const fs = require('fs').promises;
const { resizeImage } = require('./resize');

const pathRegex = /images\/temp\/(.*)/;

async function convertToWebP(inputFilePath, resolution = 'high') {
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const outputFilePath = inputFilePath.replace(/\.[^/.]+$/, '') + '.webp';
  const data = await sharp(resizedBuffer).toFormat('webp').toBuffer();
  await fs.writeFile(outputFilePath, data);
  const matches = outputFilePath.match(pathRegex);
  const bytes = Buffer.byteLength(data);
  const filepath = matches ? `/images/temp/${matches[1]}` : outputFilePath;
  await fs.unlink(inputFilePath);
  return { filepath, bytes, width, height };
}

module.exports = { convertToWebP };
