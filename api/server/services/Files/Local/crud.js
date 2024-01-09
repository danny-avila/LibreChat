const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { logger } = require('~/config');
const paths = require('~/config/paths');

/**
 * Saves a file to a specified output path with a new filename.
 *
 * @param {Express.Multer.File} file - The file object to be saved. Should contain properties like 'originalname' and 'path'.
 * @param {string} outputPath - The path where the file should be saved.
 * @param {string} outputFilename - The new filename for the saved file (without extension).
 * @returns {Promise<string>} The full path of the saved file.
 * @throws Will throw an error if the file saving process fails.
 */
async function saveFile(file, outputPath, outputFilename) {
  try {
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const fileExtension = path.extname(file.originalname);
    const filenameWithExt = outputFilename + fileExtension;
    const outputFilePath = path.join(outputPath, filenameWithExt);
    fs.copyFileSync(file.path, outputFilePath);
    fs.unlinkSync(file.path);

    return outputFilePath;
  } catch (error) {
    logger.error('[saveFile] Error while saving the file:', error);
    throw error;
  }
}

/**
 * Saves an uploaded image file to a specified directory based on the user's ID and a filename.
 *
 * @param {Express.Request} req - The Express request object, containing the user's information and app configuration.
 * @param {Express.Multer.File} file - The uploaded file object.
 * @param {string} filename - The new filename to assign to the saved image (without extension).
 * @returns {Promise<void>}
 * @throws Will throw an error if the image saving process fails.
 */
const saveLocalImage = async (req, file, filename) => {
  const imagePath = req.app.locals.paths.imageOutput;
  const outputPath = path.join(imagePath, req.user.id ?? '');
  await saveFile(file, outputPath, filename);
};

/**
 * Saves a file from a given URL to a local directory. The function fetches the file using the provided URL,
 * determines the content type, and saves it to a specified local directory with the correct file extension.
 * If the specified directory does not exist, it is created. The function returns the name of the saved file
 * or null in case of an error.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier. This is used to create a user-specific path
 *                                 in the local file system.
 * @param {string} params.URL - The URL of the file to be downloaded and saved.
 * @param {string} params.fileName - The desired file name for the saved file. This may be modified to include
 *                                   the correct file extension based on the content type.
 * @param {string} [params.basePath='images'] - Optional. The base directory where the file will be saved.
 *                                              Defaults to 'images' if not specified.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the file name if the file is successfully saved, or null if there is an error.
 */
async function saveFileFromURL({ userId, URL, fileName, basePath = 'images' }) {
  try {
    // Fetch the file from the URL
    const response = await axios({
      url: URL,
      responseType: 'stream',
    });

    // Get the content type from the response headers
    const contentType = response.headers['content-type'];
    let extension = contentType.split('/').pop();

    // Construct the outputPath based on the basePath and userId
    const outputPath = path.join(paths.publicPath, basePath, userId.toString());

    // Check if the output directory exists, if not, create it
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Replace or append the correct extension
    const extRegExp = new RegExp(path.extname(fileName) + '$');
    fileName = fileName.replace(extRegExp, `.${extension}`);
    if (!path.extname(fileName)) {
      fileName += `.${extension}`;
    }

    // Create a writable stream for the output path
    const outputFilePath = path.join(outputPath, fileName);
    const writer = fs.createWriteStream(outputFilePath);

    // Pipe the response data to the output file
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(fileName));
      writer.on('error', reject);
    });
  } catch (error) {
    logger.error('[saveFileFromURL] Error while saving the file:', error);
    return null;
  }
}

/**
 * Constructs a local file path for a given file name and base path. This function simply joins the base
 * path and the file name to create a file path. It does not check for the existence of the file at the path.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.fileName - The name of the file for which the path is to be constructed. This should
 *                                   include the file extension.
 * @param {string} [params.basePath='images'] - Optional. The base directory to be used for constructing the file path.
 *                                              Defaults to 'images' if not specified.
 *
 * @returns {string}
 *          The constructed local file path.
 */
async function getLocalFileURL({ fileName, basePath = 'images' }) {
  return path.posix.join('/', basePath, fileName);
}

/**
 * Validates if a given filepath is within a specified subdirectory under a base path. This function constructs
 * the expected base path using the base, subfolder, and user id from the request, and then checks if the
 * provided filepath starts with this constructed base path.
 *
 * @param {Express.Request} req - The request object from Express. It should contain a `user` property with an `id`.
 * @param {string} base - The base directory path.
 * @param {string} subfolder - The subdirectory under the base path.
 * @param {string} filepath - The complete file path to be validated.
 *
 * @returns {boolean}
 *          Returns true if the filepath is within the specified base and subfolder, false otherwise.
 */
const isValidPath = (req, base, subfolder, filepath) => {
  const normalizedBase = path.resolve(base, subfolder, req.user.id);
  const normalizedFilepath = path.resolve(filepath);
  return normalizedFilepath.startsWith(normalizedBase);
};

/**
 * Deletes a file from the filesystem. This function takes a file object, constructs the full path, and
 * verifies the path's validity before deleting the file. If the path is invalid, an error is thrown.
 *
 * @param {Express.Request} req - The request object from Express. It should have an `app.locals.paths` object with
 *                       a `publicPath` property.
 * @param {MongoFile} file - The file object to be deleted. It should have a `filepath` property that is
 *                           a string representing the path of the file relative to the publicPath.
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the file has been successfully deleted, or throws an error if the
 *          file path is invalid or if there is an error in deletion.
 */
const deleteLocalFile = async (req, file) => {
  const { publicPath } = req.app.locals.paths;
  const parts = file.filepath.split(path.sep);
  const subfolder = parts[1];
  const filepath = path.join(publicPath, file.filepath);

  if (!isValidPath(req, publicPath, subfolder, filepath)) {
    throw new Error('Invalid file path');
  }

  await fs.promises.unlink(filepath);
};

module.exports = { saveFile, saveLocalImage, saveFileFromURL, getLocalFileURL, deleteLocalFile };
