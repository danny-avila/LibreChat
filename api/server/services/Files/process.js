const path = require('path');
const mime = require('mime/lite');
const { FileSources, EModelEndpoint, imageExtRegex } = require('librechat-data-provider');
const { createFile, updateFileUsage, deleteFiles } = require('~/models/File');
const { convertToWebP } = require('~/server/services/Files/images');
const { getStrategyFunctions } = require('./strategies');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const { GPTS_DOWNLOAD_IMAGES = 'true' } = process.env;

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
 * Deletes a list of files from the server filesystem and the database.
 *
 * @param {Object} params - The params object.
 * @param {Express.Request} params.req - The express request object.
 * @param {MongoFile[]} params.files - The file objects to delete.
 *
 * @returns {Promise<void>}
 */
const processDeleteRequest = async ({ req, files }) => {
  const file_ids = files.map((file) => file.file_id);

  const deletionMethods = {};
  const promises = [];
  promises.push(await deleteFiles(file_ids));

  for (const file of files) {
    const source = file.source ?? FileSources.local;

    if (deletionMethods[source]) {
      promises.push(deletionMethods[source](req, file));
      continue;
    }

    const { deleteFile } = getStrategyFunctions(source);
    if (!deleteFile) {
      throw new Error(`Delete function not implemented for ${source}`);
    }

    deletionMethods[source] = deleteFile;
    promises.push(deleteFile(req, file));
  }

  await Promise.all(promises);
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

/**
 * Applies the current strategy for file uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Express.Multer.File} params.file - The uploaded file.
 * @param {FileMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const processFileUpload = async ({ req, res, file, metadata }) => {
  const isAssistantUpload = metadata.endpoint === EModelEndpoint.assistant;
  const source = isAssistantUpload ? FileSources.openai : req.app.locals.fileStrategy;
  const { handleFileUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id } = metadata;
  const { id, bytes, filename, filepath } = await handleFileUpload(req, file);
  const result = await createFile(
    {
      user: req.user.id,
      file_id: id ?? file_id,
      temp_file_id,
      bytes,
      filepath: isAssistantUpload ? `https://api.openai.com/v1/files/${id}` : filepath,
      filename: filename ?? file.originalname,
      source,
      type: file.mimetype,
    },
    true,
  );
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

/**
 * Retrieves and processes an OpenAI file based on its type.
 *
 * @param {Object} params - The params passed to the function.
 * @param {OpenAIClient} params.openai - The params passed to the function.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} params.basename - The basename of the file (if image); e.g., 'image.jpg'.
 * @param {boolean} [params.unknownType] - Whether the file type is unknown.
 * @returns {Promise<{filepath: string, bytes: number, width?: number, height?: number}>} The path, size, and dimensions (if image) of the processed file.
 */
async function retrieveAndProcessFile({ openai, file_id, basename: _basename, unknownType }) {
  let basename = _basename;
  const downloadImages = isEnabled(GPTS_DOWNLOAD_IMAGES);

  /**
   * @param {string} file_id - The ID of the file to retrieve.
   * @param {boolean} [save] - Whether to save the file metadata to the database.
   */
  const retrieveFile = async (file_id, save = false) => {
    const _file = await openai.files.retrieve(file_id);
    const filepath = `/api/files/download/${file_id}`;
    const file = {
      ..._file,
      type: mime.getType(_file.filename),
      filepath,
      usage: 1,
      file_id,
      source: FileSources.openai,
    };

    if (save) {
      createFile(file, true);
    }

    return file;
  };

  // If image downloads are not enabled or no basename provided, return only the file metadata
  if (!downloadImages || (!basename && !downloadImages)) {
    return await retrieveFile(file_id, true);
  }

  const response = await openai.files.content(file_id);
  const data = await response.arrayBuffer();
  const dataBuffer = Buffer.from(data);

  /** @param {Buffer} dataBuffer */
  const determineFileType = async (dataBuffer) => {
    const fileType = await import('file-type');
    const type = await fileType.fromBuffer(dataBuffer);
    return type ? type.ext : null; // Returns extension if found, else null
  };

  /**
   * @param {Buffer} dataBuffer
   * @param {string} fileExt
   */
  const processAsImage = async (dataBuffer, fileExt) => {
    // Logic to process image files, convert to webp, etc.
    const _file = await convertToWebP(openai.req, dataBuffer, 'high', `${file_id}${fileExt}`);
    const file = {
      ..._file,
      type: 'image/webp',
      usage: 1,
      file_id,
      source: FileSources.openai,
    };
    createFile(file, true);
    return file;
  };

  /** @param {Buffer} dataBuffer */
  const processOtherFileTypes = async (dataBuffer) => {
    // Logic to handle other file types
    console.log('Non-image file type detected');
    return { filepath: `/api/files/download/${file_id}`, bytes: dataBuffer.length };
  };

  // If the filetype is unknown, inspect the file
  if (unknownType || !path.extname(basename)) {
    const detectedExt = await determineFileType(dataBuffer);
    if (detectedExt && imageExtRegex.test('.' + detectedExt)) {
      return await processAsImage(dataBuffer, detectedExt);
    } else {
      return await processOtherFileTypes(dataBuffer);
    }
  }

  // Existing logic for processing known image types
  if (downloadImages && basename && path.extname(basename) && imageExtRegex.test(basename)) {
    return await processAsImage(dataBuffer, path.extname(basename));
  } else {
    console.log('Not an image or invalid extension: ', basename);
    return await processOtherFileTypes(dataBuffer);
  }
}

module.exports = {
  processImageUpload,
  processFiles,
  processFileURL,
  processFileUpload,
  processDeleteRequest,
  retrieveAndProcessFile,
};
