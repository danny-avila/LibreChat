const { getStrategyFunctions } = require('./strategies');
const { updateFileUsage } = require('~/models');
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

module.exports = {
  processFiles,
  processFileURL,
};
