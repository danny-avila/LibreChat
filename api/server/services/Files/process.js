const { updateFileUsage, createFile } = require('~/models');
const { getStrategyFunctions } = require('./strategies');
const { logger } = require('~/config');

const processFiles = async (files) => {
  const promises = [];
  for (let file of files) {
    const { file_id } = file;
    promises.push(updateFileUsage({ file_id }));
  }

  // TODO: calculate token cost when image is first uploaded
  return await Promise.all(promises);
};

/**
 * Processes a file URL using a specified file handling strategy. This function accepts a strategy name,
 * fetches the corresponding file processing functions (for saving and retrieving file URLs), and then
 * executes these functions in sequence. It first saves the file using the provided URL and then retrieves
 * the URL of the saved file. If any error occurs during this process, it logs the error and throws an
 * exception with an appropriate message.
 *
 * @param {Object} params - The parameters object.
 * @param {FileSources} params.fileStrategy - The file handling strategy to use. Must be a value from the
 *                                            `FileSources` enum, which defines different file handling
 *                                            strategies (like saving to Firebase, local storage, etc.).
 * @param {string} params.userId - The user's unique identifier. Used for creating user-specific paths or
 *                                 references in the file handling process.
 * @param {string} params.URL - The URL of the file to be processed.
 * @param {string} params.fileName - The name that will be used to save the file. This should include the
 *                                   file extension.
 * @param {string} params.basePath - The base path or directory where the file will be saved or retrieved from.
 *
 * @returns {Promise<string>}
 *          A promise that resolves to the URL of the processed file. It throws an error if the file processing
 *          fails at any stage.
 */
const processFileURL = async ({ fileStrategy, userId, URL, fileName, basePath }) => {
  const { saveURL, getFileURL } = getStrategyFunctions(fileStrategy);
  try {
    await saveURL({ userId, URL, fileName, basePath });
    return await getFileURL({ fileName: `${userId}/${fileName}`, basePath });
  } catch (error) {
    logger.error(`Error while processing the image with ${fileStrategy}:`, error);
    throw new Error(`Failed to process the image with ${fileStrategy}. ${error.message}`);
  }
};

/**
 * Applies the current strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Express.Multer.File} params.file - The uploaded file.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const processImageUpload = async ({ req, res, file, metadata }) => {
  const source = req.app.locals.fileStrategy;
  const { handleImageUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id } = metadata;
  const { filepath, bytes, width, height } = await handleImageUpload(req, file);
  const result = await createFile(
    {
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: file.originalname,
      source,
      type: 'image/webp',
      width,
      height,
    },
    true,
  );
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

module.exports = {
  processImageUpload,
  processFiles,
  processFileURL,
};
