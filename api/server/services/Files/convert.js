const sharp = require('sharp');
const fs = require('fs').promises;
const { resizeImage } = require('./resize');

const pathRegex = /images\/temp\/(.*)/;

async function convertToWebP(inputFilePath, resolution = 'low') {
  const resizedBuffer = await resizeImage(inputFilePath, resolution);
  const outputFilePath = inputFilePath.replace(/\.[^/.]+$/, '') + '.webp';
  const data = await sharp(resizedBuffer).toFormat('webp').toBuffer();
  await fs.writeFile(outputFilePath, data);
  const matches = outputFilePath.match(pathRegex);
  const bytes = Buffer.byteLength(data);
  const filepath = matches ? `/images/temp/${matches[1]}` : outputFilePath;
  await fs.unlink(inputFilePath);
  return { filepath, bytes };
}

module.exports = { convertToWebP };
