const fs = require('fs');
const path = require('path');
const { logger } = require('~/config');

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
  const imagePath = req.app.locals.config.imageOutput;
  const outputPath = path.join(imagePath, req.user.id ?? '');
  await saveFile(file, outputPath, filename);
};

module.exports = { saveFile, saveLocalImage };
