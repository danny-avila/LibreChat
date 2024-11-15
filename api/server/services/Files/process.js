const fs = require('fs');
const path = require('path');
const mime = require('mime');
const { v4 } = require('uuid');
const {
  isUUID,
  megabyte,
  FileContext,
  FileSources,
  imageExtRegex,
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  hostImageIdSuffix,
  checkOpenAIStorage,
  removeNullishValues,
  hostImageNamePrefix,
  isAssistantsEndpoint,
} = require('librechat-data-provider');
const { EnvVar } = require('@librechat/agents');
const { addResourceFileId, deleteResourceFileId } = require('~/server/controllers/assistants/v2');
const { convertImage, resizeAndConvert } = require('~/server/services/Files/images');
const { addAgentResourceFile, removeAgentResourceFile } = require('~/models/Agent');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { createFile, updateFileUsage, deleteFiles } = require('~/models/File');
const { loadAuthValues } = require('~/app/clients/tools/util');
const { LB_QueueAsyncCall } = require('~/server/utils/queue');
const { getStrategyFunctions } = require('./strategies');
const { determineFileType } = require('~/server/utils');
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
 * Enqueues the delete operation to the leaky bucket queue if necessary, or adds it directly to promises.
 *
 * @param {object} params - The passed parameters.
 * @param {Express.Request} params.req - The express request object.
 * @param {MongoFile} params.file - The file object to delete.
 * @param {Function} params.deleteFile - The delete file function.
 * @param {Promise[]} params.promises - The array of promises to await.
 * @param {string[]} params.resolvedFileIds - The array of promises to await.
 * @param {OpenAI | undefined} [params.openai] - If an OpenAI file, the initialized OpenAI client.
 */
function enqueueDeleteOperation({ req, file, deleteFile, promises, resolvedFileIds, openai }) {
  if (checkOpenAIStorage(file.source)) {
    // Enqueue to leaky bucket
    promises.push(
      new Promise((resolve, reject) => {
        LB_QueueAsyncCall(
          () => deleteFile(req, file, openai),
          [],
          (err, result) => {
            if (err) {
              logger.error('Error deleting file from OpenAI source', err);
              reject(err);
            } else {
              resolvedFileIds.push(file.file_id);
              resolve(result);
            }
          },
        );
      }),
    );
  } else {
    // Add directly to promises
    promises.push(
      deleteFile(req, file)
        .then(() => resolvedFileIds.push(file.file_id))
        .catch((err) => {
          logger.error('Error deleting file', err);
          return Promise.reject(err);
        }),
    );
  }
}

// TODO: refactor as currently only image files can be deleted this way
// as other filetypes will not reside in public path
/**
 * Deletes a list of files from the server filesystem and the database.
 *
 * @param {Object} params - The params object.
 * @param {MongoFile[]} params.files - The file objects to delete.
 * @param {Express.Request} params.req - The express request object.
 * @param {DeleteFilesBody} params.req.body - The request body.
 * @param {string} [params.req.body.agent_id] - The agent ID if file uploaded is associated to an agent.
 * @param {string} [params.req.body.assistant_id] - The assistant ID if file uploaded is associated to an assistant.
 * @param {string} [params.req.body.tool_resource] - The tool resource if assistant file uploaded is associated to a tool resource.
 *
 * @returns {Promise<void>}
 */
const processDeleteRequest = async ({ req, files }) => {
  const resolvedFileIds = [];
  const deletionMethods = {};
  const promises = [];

  /** @type {Record<string, OpenAI | undefined>} */
  const client = { [FileSources.openai]: undefined, [FileSources.azure]: undefined };
  const initializeClients = async () => {
    const openAIClient = await getOpenAIClient({
      req,
      overrideEndpoint: EModelEndpoint.assistants,
    });
    client[FileSources.openai] = openAIClient.openai;

    if (!req.app.locals[EModelEndpoint.azureOpenAI]?.assistants) {
      return;
    }

    const azureClient = await getOpenAIClient({
      req,
      overrideEndpoint: EModelEndpoint.azureAssistants,
    });
    client[FileSources.azure] = azureClient.openai;
  };

  if (req.body.assistant_id !== undefined) {
    await initializeClients();
  }

  for (const file of files) {
    const source = file.source ?? FileSources.local;

    if (req.body.agent_id && req.body.tool_resource) {
      promises.push(
        removeAgentResourceFile({
          req,
          file_id: file.file_id,
          agent_id: req.body.agent_id,
          tool_resource: req.body.tool_resource,
        }),
      );
    }

    if (checkOpenAIStorage(source) && !client[source]) {
      await initializeClients();
    }

    const openai = client[source];

    if (req.body.assistant_id && req.body.tool_resource) {
      promises.push(
        deleteResourceFileId({
          req,
          openai,
          file_id: file.file_id,
          assistant_id: req.body.assistant_id,
          tool_resource: req.body.tool_resource,
        }),
      );
    } else if (req.body.assistant_id) {
      promises.push(openai.beta.assistants.files.del(req.body.assistant_id, file.file_id));
    }

    if (deletionMethods[source]) {
      enqueueDeleteOperation({
        req,
        file,
        deleteFile: deletionMethods[source],
        promises,
        resolvedFileIds,
        openai,
      });
      continue;
    }

    const { deleteFile } = getStrategyFunctions(source);
    if (!deleteFile) {
      throw new Error(`Delete function not implemented for ${source}`);
    }

    deletionMethods[source] = deleteFile;
    enqueueDeleteOperation({ req, file, deleteFile, promises, resolvedFileIds, openai });
  }

  await Promise.allSettled(promises);
  await deleteFiles(resolvedFileIds);
};

/**
 * Processes a file URL using a specified file handling strategy. This function accepts a strategy name,
 * fetches the corresponding file processing functions (for saving and retrieving file URLs), and then
 * executes these functions in sequence. It first saves the file using the provided URL and then retrieves
 * the URL of the saved file. If any error occurs during this process, it logs the error and throws an
 * exception with an appropriate message.
 *
 * @param {Object} params - The parameters object.
 * @param {FileSources} params.fileStrategy - The file handling strategy to use.
 * Must be a value from the `FileSources` enum, which defines different file
 * handling strategies (like saving to Firebase, local storage, etc.).
 * @param {string} params.userId - The user's unique identifier. Used for creating user-specific paths or
 * references in the file handling process.
 * @param {string} params.URL - The URL of the file to be processed.
 * @param {string} params.fileName - The name that will be used to save the file (including extension)
 * @param {string} params.basePath - The base path or directory where the file will be saved or retrieved from.
 * @param {FileContext} params.context - The context of the file (e.g., 'avatar', 'image_generation', etc.)
 * @returns {Promise<MongoFile>} A promise that resolves to the DB representation (MongoFile)
 *  of the processed file. It throws an error if the file processing fails at any stage.
 */
const processFileURL = async ({ fileStrategy, userId, URL, fileName, basePath, context }) => {
  const { saveURL, getFileURL } = getStrategyFunctions(fileStrategy);
  try {
    const {
      bytes = 0,
      type = '',
      dimensions = {},
    } = (await saveURL({ userId, URL, fileName, basePath })) || {};
    const filepath = await getFileURL({ fileName: `${userId}/${fileName}`, basePath });
    return await createFile(
      {
        user: userId,
        file_id: v4(),
        bytes,
        filepath,
        filename: fileName,
        source: fileStrategy,
        type,
        context,
        width: dimensions.width,
        height: dimensions.height,
      },
      true,
    );
  } catch (error) {
    logger.error(`Error while processing the image with ${fileStrategy}:`, error);
    throw new Error(`Failed to process the image with ${fileStrategy}. ${error.message}`);
  }
};

/**
 * Applies the current strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Express.Response} [params.res] - The Express response object.
 * @param {Express.Multer.File} params.file - The uploaded file.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @param {boolean} params.returnFile - Whether to return the file metadata or return response as normal.
 * @returns {Promise<void>}
 */
const processImageFile = async ({ req, res, file, metadata, returnFile = false }) => {
  const source = req.app.locals.fileStrategy;
  const { handleImageUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id, endpoint } = metadata;

  const { filepath, bytes, width, height } = await handleImageUpload({
    req,
    file,
    file_id,
    endpoint,
  });

  const result = await createFile(
    {
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: file.originalname,
      context: FileContext.message_attachment,
      source,
      type: `image/${req.app.locals.imageOutputType}`,
      width,
      height,
    },
    true,
  );

  if (returnFile) {
    return result;
  }
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

/**
 * Applies the current strategy for image uploads and
 * returns minimal file metadata, without saving to the database.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {FileContext} params.context - The context of the file (e.g., 'avatar', 'image_generation', etc.)
 * @param {boolean} [params.resize=true] - Whether to resize and convert the image to target format. Default is `true`.
 * @param {{ buffer: Buffer, width: number, height: number, bytes: number, filename: string, type: string, file_id: string }} [params.metadata] - Required metadata for the file if resize is false.
 * @returns {Promise<{ filepath: string, filename: string, source: string, type: string}>}
 */
const uploadImageBuffer = async ({ req, context, metadata = {}, resize = true }) => {
  const source = req.app.locals.fileStrategy;
  const { saveBuffer } = getStrategyFunctions(source);
  let { buffer, width, height, bytes, filename, file_id, type } = metadata;
  if (resize) {
    file_id = v4();
    type = `image/${req.app.locals.imageOutputType}`;
    ({ buffer, width, height, bytes } = await resizeAndConvert({
      inputBuffer: buffer,
      desiredFormat: req.app.locals.imageOutputType,
    }));
    filename = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.${
      req.app.locals.imageOutputType
    }`;
  }

  const filepath = await saveBuffer({ userId: req.user.id, fileName: filename, buffer });
  return await createFile(
    {
      user: req.user.id,
      file_id,
      bytes,
      filepath,
      filename,
      context,
      source,
      type,
      width,
      height,
    },
    true,
  );
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
  const isAssistantUpload = isAssistantsEndpoint(metadata.endpoint);
  const assistantSource =
    metadata.endpoint === EModelEndpoint.azureAssistants ? FileSources.azure : FileSources.openai;
  const source = isAssistantUpload ? assistantSource : FileSources.vectordb;
  const { handleFileUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id } = metadata;

  /** @type {OpenAI | undefined} */
  let openai;
  if (checkOpenAIStorage(source)) {
    ({ openai } = await getOpenAIClient({ req }));
  }

  const {
    id,
    bytes,
    filename,
    filepath: _filepath,
    embedded,
    height,
    width,
  } = await handleFileUpload({
    req,
    file,
    file_id,
    openai,
  });

  if (isAssistantUpload && !metadata.message_file && !metadata.tool_resource) {
    await openai.beta.assistants.files.create(metadata.assistant_id, {
      file_id: id,
    });
  } else if (isAssistantUpload && !metadata.message_file) {
    await addResourceFileId({
      req,
      openai,
      file_id: id,
      assistant_id: metadata.assistant_id,
      tool_resource: metadata.tool_resource,
    });
  }

  let filepath = isAssistantUpload ? `${openai.baseURL}/files/${id}` : _filepath;
  if (isAssistantUpload && file.mimetype.startsWith('image')) {
    const result = await processImageFile({
      req,
      file,
      metadata: { file_id: v4() },
      returnFile: true,
    });
    filepath = result.filepath;
  }

  const result = await createFile(
    {
      user: req.user.id,
      file_id: id ?? file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: filename ?? file.originalname,
      context: isAssistantUpload ? FileContext.assistants : FileContext.message_attachment,
      model: isAssistantUpload ? req.body.model : undefined,
      type: file.mimetype,
      embedded,
      source,
      height,
      width,
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
const processAgentFileUpload = async ({ req, res, file, metadata }) => {
  const { agent_id, tool_resource } = metadata;
  if (agent_id && !tool_resource) {
    throw new Error('No tool resource provided for agent file upload');
  }

  if (tool_resource === EToolResources.file_search && file.mimetype.startsWith('image')) {
    throw new Error('Image uploads are not supported for file search tool resources');
  }

  let messageAttachment = !!metadata.message_file;
  if (!messageAttachment && !agent_id) {
    throw new Error('No agent ID provided for agent file upload');
  }

  let fileInfoMetadata;
  if (tool_resource === EToolResources.execute_code) {
    const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(FileSources.execute_code);
    const result = await loadAuthValues({ userId: req.user.id, authFields: [EnvVar.CODE_API_KEY] });
    const stream = fs.createReadStream(file.path);
    const fileIdentifier = await uploadCodeEnvFile({
      req,
      stream,
      filename: file.originalname,
      apiKey: result[EnvVar.CODE_API_KEY],
    });
    fileInfoMetadata = { fileIdentifier };
  }

  const source =
    tool_resource === EToolResources.file_search
      ? FileSources.vectordb
      : req.app.locals.fileStrategy;

  const { handleFileUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id } = metadata;

  const {
    bytes,
    filename,
    filepath: _filepath,
    embedded,
    height,
    width,
  } = await handleFileUpload({
    req,
    file,
    file_id,
  });

  let filepath = _filepath;

  if (!messageAttachment && tool_resource) {
    await addAgentResourceFile({
      req,
      file_id,
      agent_id,
      tool_resource,
    });
  }

  if (file.mimetype.startsWith('image')) {
    const result = await processImageFile({
      req,
      file,
      metadata: { file_id: v4() },
      returnFile: true,
    });
    filepath = result.filepath;
  }

  const fileInfo = removeNullishValues({
    user: req.user.id,
    file_id,
    temp_file_id,
    bytes,
    filepath,
    filename: filename ?? file.originalname,
    context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
    model: messageAttachment ? undefined : req.body.model,
    metadata: fileInfoMetadata,
    type: file.mimetype,
    embedded,
    source,
    height,
    width,
  });

  const result = await createFile(fileInfo, true);
  res.status(200).json({ message: 'Agent file uploaded and processed successfully', ...result });
};

/**
 * @param {object} params - The params object.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} params.userId - The user ID.
 * @param {string} [params.filename] - The name of the file. `undefined` for `file_citation` annotations.
 * @param {boolean} [params.saveFile=false] - Whether to save the file metadata to the database.
 * @param {boolean} [params.updateUsage=false] - Whether to update file usage in database.
 */
const processOpenAIFile = async ({
  openai,
  file_id,
  userId,
  filename,
  saveFile = false,
  updateUsage = false,
}) => {
  const _file = await openai.files.retrieve(file_id);
  const originalName = filename ?? (_file.filename ? path.basename(_file.filename) : undefined);
  const filepath = `${openai.baseURL}/files/${userId}/${file_id}${
    originalName ? `/${originalName}` : ''
  }`;
  const type = mime.getType(originalName ?? file_id);
  const source =
    openai.req.body.endpoint === EModelEndpoint.azureAssistants
      ? FileSources.azure
      : FileSources.openai;
  const file = {
    ..._file,
    type,
    file_id,
    filepath,
    usage: 1,
    user: userId,
    context: _file.purpose,
    source,
    model: openai.req.body.model,
    filename: originalName ?? file_id,
  };

  if (saveFile) {
    await createFile(file, true);
  } else if (updateUsage) {
    try {
      await updateFileUsage({ file_id });
    } catch (error) {
      logger.error('Error updating file usage', error);
    }
  }

  return file;
};

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {object} params - The params object.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Buffer} params.buffer - The image buffer.
 * @param {string} params.file_id - The file ID.
 * @param {string} params.filename - The filename.
 * @param {string} params.fileExt - The file extension.
 * @returns {Promise<MongoFile>} The file metadata.
 */
const processOpenAIImageOutput = async ({ req, buffer, file_id, filename, fileExt }) => {
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString();
  const _file = await convertImage(req, buffer, 'high', `${file_id}${fileExt}`);
  const file = {
    ..._file,
    usage: 1,
    user: req.user.id,
    type: `image/${req.app.locals.imageOutputType}`,
    createdAt: formattedDate,
    updatedAt: formattedDate,
    source: req.app.locals.fileStrategy,
    context: FileContext.assistants_output,
    file_id: `${file_id}${hostImageIdSuffix}`,
    filename: `${hostImageNamePrefix}${filename}`,
  };
  createFile(file, true);
  const source =
    req.body.endpoint === EModelEndpoint.azureAssistants ? FileSources.azure : FileSources.openai;
  createFile(
    {
      ...file,
      file_id,
      filename,
      source,
      type: mime.getType(fileExt),
    },
    true,
  );
  return file;
};

/**
 * Retrieves and processes an OpenAI file based on its type.
 *
 * @param {Object} params - The params passed to the function.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {RunClient} params.client - The LibreChat client instance: either refers to `openai` or `streamRunManager`.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} [params.basename] - The basename of the file (if image); e.g., 'image.jpg'. `undefined` for `file_citation` annotations.
 * @param {boolean} [params.unknownType] - Whether the file type is unknown.
 * @returns {Promise<{file_id: string, filepath: string, source: string, bytes?: number, width?: number, height?: number} | null>}
 * - Returns null if `file_id` is not defined; else, the file metadata if successfully retrieved and processed.
 */
async function retrieveAndProcessFile({
  openai,
  client,
  file_id,
  basename: _basename,
  unknownType,
}) {
  if (!file_id) {
    return null;
  }

  let basename = _basename;
  const processArgs = { openai, file_id, filename: basename, userId: client.req.user.id };

  // If no basename provided, return only the file metadata
  if (!basename) {
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }

  const fileExt = path.extname(basename);
  if (client.attachedFileIds?.has(file_id) || client.processedFileIds?.has(file_id)) {
    return processOpenAIFile({ ...processArgs, updateUsage: true });
  }

  /**
   * @returns {Promise<Buffer>} The file data buffer.
   */
  const getDataBuffer = async () => {
    const response = await openai.files.content(file_id);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  let dataBuffer;
  if (unknownType || !fileExt || imageExtRegex.test(basename)) {
    try {
      dataBuffer = await getDataBuffer();
    } catch (error) {
      logger.error('Error downloading file from OpenAI:', error);
      dataBuffer = null;
    }
  }

  if (!dataBuffer) {
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }

  // If the filetype is unknown, inspect the file
  if (dataBuffer && (unknownType || !fileExt)) {
    const detectedExt = await determineFileType(dataBuffer);
    const isImageOutput = detectedExt && imageExtRegex.test('.' + detectedExt);

    if (!isImageOutput) {
      return await processOpenAIFile({ ...processArgs, saveFile: true });
    }

    return await processOpenAIImageOutput({
      file_id,
      req: client.req,
      buffer: dataBuffer,
      filename: basename,
      fileExt: detectedExt,
    });
  } else if (dataBuffer && imageExtRegex.test(basename)) {
    return await processOpenAIImageOutput({
      file_id,
      req: client.req,
      buffer: dataBuffer,
      filename: basename,
      fileExt,
    });
  } else {
    logger.debug(`[retrieveAndProcessFile] Non-image file type detected: ${basename}`);
    return await processOpenAIFile({ ...processArgs, saveFile: true });
  }
}

/**
 * Filters a file based on its size and the endpoint origin.
 *
 * @param {Object} params - The parameters for the function.
 * @param {object} params.req - The request object from Express.
 * @param {string} [params.req.endpoint]
 * @param {string} [params.req.file_id]
 * @param {number} [params.req.width]
 * @param {number} [params.req.height]
 * @param {number} [params.req.version]
 * @param {Express.Multer.File} params.file - The file uploaded to the server via multer.
 * @param {boolean} [params.image] - Whether the file expected is an image.
 * @param {boolean} [params.isAvatar] - Whether the file expected is a user or entity avatar.
 * @returns {void}
 *
 * @throws {Error} If a file exception is caught (invalid file size or type, lack of metadata).
 */
function filterFile({ req, file, image, isAvatar }) {
  const { endpoint, file_id, width, height } = req.body;

  if (!file_id && !isAvatar) {
    throw new Error('No file_id provided');
  }

  if (file.size === 0) {
    throw new Error('Empty file uploaded');
  }

  /* parse to validate api call, throws error on fail */
  if (!isAvatar) {
    isUUID.parse(file_id);
  }

  if (!endpoint && !isAvatar) {
    throw new Error('No endpoint provided');
  }

  const fileConfig = mergeFileConfig(req.app.locals.fileConfig);

  const { fileSizeLimit: sizeLimit, supportedMimeTypes } =
    fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;
  const fileSizeLimit = isAvatar === true ? fileConfig.avatarSizeLimit : sizeLimit;

  if (file.size > fileSizeLimit) {
    throw new Error(
      `File size limit of ${fileSizeLimit / megabyte} MB exceeded for ${
        isAvatar ? 'avatar upload' : `${endpoint} endpoint`
      }`,
    );
  }

  const isSupportedMimeType = fileConfig.checkType(file.mimetype, supportedMimeTypes);

  if (!isSupportedMimeType) {
    throw new Error('Unsupported file type');
  }

  if (!image || isAvatar === true) {
    return;
  }

  if (!width) {
    throw new Error('No width provided');
  }

  if (!height) {
    throw new Error('No height provided');
  }
}

module.exports = {
  filterFile,
  processFiles,
  processFileURL,
  processImageFile,
  uploadImageBuffer,
  processFileUpload,
  processDeleteRequest,
  processAgentFileUpload,
  retrieveAndProcessFile,
};
