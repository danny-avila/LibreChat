const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { resizeImage } = require('./resize');

async function convertToWebP(req, file, resolution = 'high') {
  const inputFilePath = file.path;
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const extension = path.extname(inputFilePath);

  const { imageOutput } = req.app.locals.config;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }

  const newPath = path.join(userPath, path.basename(inputFilePath));

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
  await fs.promises.unlink(inputFilePath);
  return { filepath, bytes, width, height };
}

module.exports = { convertToWebP };
