const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resizeImage } = require('../images/resize');
const { updateFile } = require('~/models/File');

/**
 * Converts an image file to the WebP format. The function first resizes the image based on the specified
 * resolution.
 *
 * If the original image is already in WebP format, it writes the resized image back. Otherwise,
 * it converts the image to WebP format before saving.
 *
 * The original image is deleted after conversion.
 *
 * @param {Object} req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `imageOutput` path.
 * @param {Express.Multer.File} file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {string} [resolution='high'] - Optional. The desired resolution for the image resizing. Default is 'high'.
 *
 * @returns {Promise<{ filepath: string, bytes: number, width: number, height: number}>}
 *          A promise that resolves to an object containing:
 *            - filepath: The path where the converted WebP image is saved.
 *            - bytes: The size of the converted image in bytes.
 *            - width: The width of the converted image.
 *            - height: The height of the converted image.
 */
async function uploadLocalImage(req, file, resolution = 'high') {
  const inputFilePath = file.path;
  const { buffer: resizedBuffer, width, height } = await resizeImage(inputFilePath, resolution);
  const extension = path.extname(inputFilePath);

  const { imageOutput } = req.app.locals.paths;
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

/**
 * Encodes an image file to base64.
 * @param {string} imagePath - The path to the image file.
 * @returns {Promise<string>} A promise that resolves with the base64 encoded image data.
 */
function encodeImage(imagePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(imagePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString('base64'));
      }
    });
  });
}

/**
 * Local: Updates the file and encodes the image to base64,
 * for image payload handling: tuple order of [filepath, base64].
 * @param {Object} req - The request object.
 * @param {MongoFile} file - The file object.
 * @returns {Promise<[MongoFile, string]>} - A promise that resolves to an array of results from updateFile and encodeImage.
 */
async function prepareImagesLocal(req, file) {
  const { publicPath, imageOutput } = req.app.locals.paths;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  const filepath = path.join(publicPath, file.filepath);

  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));
  promises.push(encodeImage(filepath));
  return await Promise.all(promises);
}

/**
 * Uploads a user's avatar to Firebase Storage and returns the URL.
 * If the 'manual' flag is set to 'true', it also updates the user's avatar URL in the database.
 *
 * @param {object} params - The parameters object.
 * @param {Buffer} params.buffer - The Buffer containing the avatar image in WebP format.
 * @param {object} params.User - The User document (mongoose); TODO: remove direct use of Model, `User`
 * @param {string} params.manual - A string flag indicating whether the update is manual ('true' or 'false').
 * @returns {Promise<string>} - A promise that resolves with the URL of the uploaded avatar.
 * @throws {Error} - Throws an error if Firebase is not initialized or if there is an error in uploading.
 */
async function processLocalAvatar({ buffer, User, manual }) {
  const userDir = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'client',
    'public',
    'images',
    User._id.toString(),
  );
  const fileName = `avatar-${new Date().getTime()}.png`;
  const urlRoute = `/images/${User._id.toString()}/${fileName}`;
  const avatarPath = path.join(userDir, fileName);

  await fs.promises.mkdir(userDir, { recursive: true });
  await fs.promises.writeFile(avatarPath, buffer);

  const isManual = manual === 'true';
  let url = `${urlRoute}?manual=${isManual}`;

  if (isManual) {
    User.avatar = url;
    await User.save();
  }

  return url;
}

module.exports = { uploadLocalImage, encodeImage, prepareImagesLocal, processLocalAvatar };
