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
  AgentCapabilities,
  checkOpenAIStorage,
  removeNullishValues,
  isAssistantsEndpoint,
  getEndpointFileConfig,
  documentParserMimeTypes,
} = require('librechat-data-provider');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  sanitizeFilename,
  parseText,
  processAudioFile,
  getStorageMetadata,
  isFileStorageLimitError,
  assertFileStorageLimit,
  recordFileStorageUsage,
  sweepExpiredFiles: sweepExpiredFilesWithDeps,
  startExpiredFileSweep: startExpiredFileSweepWithDeps,
} = require('@librechat/api');
const {
  convertImage,
  resizeAndConvert,
  resizeImageBuffer,
} = require('~/server/services/Files/images');
const { addResourceFileId, deleteResourceFileId } = require('~/server/controllers/assistants/v2');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { checkCapability } = require('~/server/services/Config');
const { LB_QueueAsyncCall } = require('~/server/utils/queue');
const { getRetentionExpiry } = require('./retention');
const { getStrategyFunctions } = require('./strategies');
const { determineFileType } = require('~/server/utils');
const { STTService } = require('./Audio/STTService');
const db = require('~/models');

/**
 * Creates a modular file upload wrapper that ensures filename sanitization
 * across all storage strategies. This prevents storage-specific implementations
 * from having to handle sanitization individually.
 *
 * @param {Function} uploadFunction - The storage strategy's upload function
 * @returns {Function} - Wrapped upload function with sanitization
 */
const createSanitizedUploadWrapper = (uploadFunction) => {
  return async (params) => {
    const { req, file, file_id, ...restParams } = params;

    // Create a modified file object with sanitized original name
    // This ensures consistent filename handling across all storage strategies
    const sanitizedFile = {
      ...file,
      originalname: sanitizeFilename(file.originalname),
    };

    return uploadFunction({ req, file: sanitizedFile, file_id, ...restParams });
  };
};

const assertUploadStorageLimit = (req, incomingBytes, options = {}) =>
  assertFileStorageLimit({
    req,
    incomingBytes,
    getUserStorageUsage: db.getUserStorageUsage,
    ...options,
  });

const cleanupStoredFile = async ({ req, file, openai }) => {
  const source = file?.source ?? FileSources.local;
  if (source === FileSources.text) {
    return;
  }

  const { deleteFile } = getStrategyFunctions(source);
  if (!deleteFile) {
    return;
  }

  try {
    await deleteFile(
      req,
      {
        ...file,
        user: file.user ?? req.user.id,
        tenantId: file.tenantId ?? req.user.tenantId,
      },
      openai,
    );
  } catch (cleanupError) {
    logger.error('[fileStorageLimit] Failed to clean up over-limit file storage:', cleanupError);
  }
};

const cleanupVectorFile = async ({ req, file }) => {
  const { deleteFile } = getStrategyFunctions(FileSources.vectordb);
  if (!deleteFile) {
    return;
  }

  try {
    await deleteFile(req, {
      ...file,
      source: FileSources.vectordb,
      embedded: true,
      user: file.user ?? req.user.id,
      tenantId: file.tenantId ?? req.user.tenantId,
    });
  } catch (cleanupError) {
    logger.error('[fileStorageLimit] Failed to clean up over-limit vector storage:', cleanupError);
  }
};

const cleanupFileMetadata = async ({ fileId }) => {
  if (!fileId) {
    return;
  }

  try {
    await db.deleteFiles([fileId]);
  } catch (cleanupError) {
    logger.error('[fileStorageLimit] Failed to clean up over-limit file metadata:', cleanupError);
  }
};

const cleanupCodeEnvFile = async ({ req, file }) => {
  if (!file?.metadata?.codeEnvRef) {
    return;
  }

  const { deleteFile } = getStrategyFunctions(FileSources.execute_code);
  if (!deleteFile) {
    return;
  }

  try {
    await deleteFile(req, file);
  } catch (cleanupError) {
    logger.error('[fileStorageLimit] Failed to clean up over-limit code env file:', cleanupError);
  }
};

const cleanupPersistedFile = async ({ req, file, openai }) => {
  await cleanupStoredFile({ req, file, openai });
  if (!file?.file_id) {
    return;
  }

  await cleanupFileMetadata({ fileId: file.file_id });
};

const detachAssistantStoredFile = async ({ req, metadata, openai, fileId }) => {
  if (!openai || !metadata?.assistant_id || metadata.message_file) {
    return;
  }

  try {
    if (metadata.tool_resource) {
      await deleteResourceFileId({
        req,
        openai,
        file_id: fileId,
        assistant_id: metadata.assistant_id,
        tool_resource: metadata.tool_resource,
      });
      return;
    }

    await openai.beta.assistants.files.del(metadata.assistant_id, fileId);
  } catch (cleanupError) {
    logger.error('[fileStorageLimit] Failed to detach over-limit assistant file:', cleanupError);
  }
};

const cleanupAssistantStoredFile = async ({ req, metadata, openai, file }) => {
  if (!file?.file_id) {
    return;
  }

  await detachAssistantStoredFile({ req, metadata, openai, fileId: file.file_id });
  await cleanupStoredFile({ req, file, openai });
};

const createFileWithStorageLimit = async (req, fileInfo, disableTTL, options = {}) => {
  try {
    await assertUploadStorageLimit(req, fileInfo.bytes, { excludeFileId: fileInfo.file_id });
    const result = await db.createFile(fileInfo, disableTTL);
    recordFileStorageUsage(req, fileInfo.bytes, { fileId: fileInfo.file_id });
    return result;
  } catch (error) {
    if (isFileStorageLimitError(error) && options.cleanup !== false) {
      await cleanupStoredFile({ req, file: fileInfo, openai: options.openai });
    }
    throw error;
  }
};

const isMissingStorageError = (err) => {
  const code = err?.code ?? err?.status ?? err?.statusCode ?? err?.response?.status;
  if ([404, '404', 'ENOENT', 'NoSuchKey', 'NotFound', 'ResourceNotFound'].includes(code)) {
    return true;
  }

  return /(?:file|object|blob|key|resource) (?:not found|does not exist)|no such (?:file|key)/i.test(
    String(err?.message ?? ''),
  );
};

/**
 * Enqueues the delete operation to the leaky bucket queue if necessary, or adds it directly to promises.
 *
 * @param {object} params - The passed parameters.
 * @param {ServerRequest} params.req - The express request object.
 * @param {MongoFile} params.file - The file object to delete.
 * @param {Function} params.deleteFile - The delete file function.
 * @param {Promise[]} params.promises - The array of promises to await.
 * @param {Set<string>} params.resolvedFileIds - File IDs whose storage delete succeeded.
 * @param {Set<string>} params.failedFileIds - File IDs whose storage delete failed.
 * @param {OpenAI | undefined} [params.openai] - If an OpenAI file, the initialized OpenAI client.
 */
function enqueueDeleteOperation({
  req,
  file,
  deleteFile,
  promises,
  resolvedFileIds,
  failedFileIds,
  openai,
}) {
  if (checkOpenAIStorage(file.source)) {
    // Enqueue to leaky bucket
    promises.push(
      new Promise((resolve, reject) => {
        LB_QueueAsyncCall(
          () => deleteFile(req, file, openai),
          [],
          (err, result) => {
            if (err) {
              if (isMissingStorageError(err)) {
                resolvedFileIds.add(file.file_id);
                logger.warn('File storage was already missing during delete', err);
                resolve(result);
                return;
              }
              failedFileIds.add(file.file_id);
              logger.error('Error deleting file from OpenAI source', err);
              reject(err);
            } else {
              resolvedFileIds.add(file.file_id);
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
        .then(() => resolvedFileIds.add(file.file_id))
        .catch((err) => {
          if (isMissingStorageError(err)) {
            resolvedFileIds.add(file.file_id);
            logger.warn('File storage was already missing during delete', err);
            return;
          }
          failedFileIds.add(file.file_id);
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
 * @param {ServerRequest} params.req - The express request object.
 * @param {DeleteFilesBody} params.req.body - The request body.
 * @param {string} [params.req.body.agent_id] - The agent ID if file uploaded is associated to an agent.
 * @param {string} [params.req.body.assistant_id] - The assistant ID if file uploaded is associated to an assistant.
 * @param {string} [params.req.body.tool_resource] - The tool resource if assistant file uploaded is associated to a tool resource.
 *
 * @returns {Promise<{ deletedFileIds: string[], failedFileIds: string[] }>}
 * @throws {Error} When storage deletion cannot be scheduled or file metadata cleanup fails.
 */
const processDeleteRequest = async ({ req, files }) => {
  const appConfig = req.config;
  const resolvedFileIds = new Set();
  const failedFileIds = new Set();
  const deletionMethods = {};
  const promises = [];

  /** @type {Record<string, OpenAI | undefined>} */
  const client = { [FileSources.openai]: undefined, [FileSources.azure]: undefined };
  const initializeClients = async () => {
    if (appConfig.endpoints?.[EModelEndpoint.assistants]) {
      const openAIClient = await getOpenAIClient({
        req,
        overrideEndpoint: EModelEndpoint.assistants,
      });
      client[FileSources.openai] = openAIClient.openai;
    }

    if (!appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
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

  const agentFiles = [];

  for (const file of files) {
    const source = file.source ?? FileSources.local;
    if (req.body.agent_id && req.body.tool_resource) {
      agentFiles.push({
        tool_resource: req.body.tool_resource,
        file_id: file.file_id,
      });
    }

    if (source === FileSources.text) {
      resolvedFileIds.add(file.file_id);
      continue;
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
        failedFileIds,
        openai,
      });
      continue;
    }

    const { deleteFile } = getStrategyFunctions(source);
    if (!deleteFile) {
      throw new Error(`Delete function not implemented for ${source}`);
    }

    deletionMethods[source] = deleteFile;
    enqueueDeleteOperation({
      req,
      file,
      deleteFile,
      promises,
      resolvedFileIds,
      failedFileIds,
      openai,
    });
  }

  if (agentFiles.length > 0) {
    promises.push(
      db.removeAgentResourceFiles({
        agent_id: req.body.agent_id,
        files: agentFiles,
      }),
    );
  }

  await Promise.allSettled(promises);
  const deletedFileIds = [...resolvedFileIds];
  let metadataDeletedFileIds = deletedFileIds;
  if (deletedFileIds.length > 0) {
    try {
      await db.deleteFiles(deletedFileIds);
    } catch (error) {
      logger.error('Error deleting file metadata after storage deletion', error);
      deletedFileIds.forEach((fileId) => failedFileIds.add(fileId));
      metadataDeletedFileIds = [];
      throw error;
    }
    if (metadataDeletedFileIds.length > 0) {
      try {
        await db.removeAgentResourceFilesFromAllAgents({ file_ids: metadataDeletedFileIds });
      } catch (error) {
        logger.error('Error cleaning up orphaned agent file references', error);
      }
    }
  }

  return {
    deletedFileIds: metadataDeletedFileIds,
    failedFileIds: [...failedFileIds],
  };
};

/**
 * Deletes expired file storage before removing the corresponding File records.
 *
 * Mongo TTL indexes delete only the metadata document, so file retention uses
 * this application sweep for records with `expiredAt` instead.
 *
 * @param {object} params
 * @param {AppConfig} params.appConfig
 * @param {number} [params.limit]
 * @param {() => Promise<AppConfig>} [params.loadAppConfig]
 * @returns {Promise<{ scanned: number, deleted: number, failed: number }>}
 */
async function sweepExpiredFiles(options = {}) {
  return sweepExpiredFilesWithDeps(options, {
    getExpiredFiles: db.getExpiredFiles,
    processDeleteRequest,
    logger,
  });
}

function startExpiredFileSweep(options = {}) {
  return startExpiredFileSweepWithDeps(options, {
    sweepExpiredFiles,
    runAsSystem,
    logger,
  });
}

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
 * @param {string} [params.tenantId] - Optional tenant identifier for tenant-prefixed storage paths.
 * @param {ServerRequest} [params.req] - Request context used to apply data retention metadata.
 * @returns {Promise<MongoFile>} A promise that resolves to the DB representation (MongoFile)
 *  of the processed file. It throws an error if the file processing fails at any stage.
 */
const processFileURL = async ({
  fileStrategy,
  userId,
  URL,
  fileName,
  basePath,
  context,
  tenantId,
  req,
}) => {
  const { saveURL, getFileURL } = getStrategyFunctions(fileStrategy);
  try {
    const savedFile = await saveURL({ userId, URL, fileName, basePath, tenantId });
    if (!savedFile) {
      throw new Error(`Strategy "${fileStrategy}" did not save "${fileName}"`);
    }

    const { bytes, type = '', dimensions = {} } = typeof savedFile === 'string' ? {} : savedFile;
    const fallbackFileName =
      fileStrategy === FileSources.local || fileStrategy === FileSources.firebase
        ? `${userId}/${fileName}`
        : fileName;
    const filepath =
      typeof savedFile === 'string'
        ? savedFile
        : (savedFile.filepath ??
          (await getFileURL({ userId, fileName: fallbackFileName, basePath, tenantId })));
    if (!filepath) {
      throw new Error(`Strategy "${fileStrategy}" did not return a file URL for "${fileName}"`);
    }
    const storageMetadata = getStorageMetadata({
      filepath,
      source: fileStrategy,
      storageKey: typeof savedFile === 'string' ? undefined : savedFile.storageKey,
      storageRegion: typeof savedFile === 'string' ? undefined : savedFile.storageRegion,
    });
    if (req && !Number.isFinite(bytes)) {
      await cleanupStoredFile({
        req,
        file: {
          filepath,
          ...storageMetadata,
          source: fileStrategy,
          user: userId,
          tenantId,
        },
      });
      throw new Error(`Strategy "${fileStrategy}" did not return byte metadata for "${fileName}"`);
    }

    const fileInfo = {
      user: userId,
      file_id: v4(),
      bytes: Math.max(0, bytes ?? 0),
      filepath,
      ...storageMetadata,
      filename: fileName,
      source: fileStrategy,
      type,
      context,
      ...(await getRetentionExpiry(req)),
      tenantId,
      width: dimensions.width,
      height: dimensions.height,
    };
    // Some legacy tool tests call this helper without an Express request; runtime callers pass req
    // so generated files go through retention and storage quota enforcement.
    return req
      ? await createFileWithStorageLimit(req, fileInfo, true)
      : await db.createFile(fileInfo, true);
  } catch (error) {
    if (isFileStorageLimitError(error)) {
      throw error;
    }
    logger.error(`Error while processing the image with ${fileStrategy}:`, error);
    throw new Error(`Failed to process the image with ${fileStrategy}. ${error.message}`);
  }
};

/**
 * Applies the current strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} [params.res] - The Express response object.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @param {boolean} params.returnFile - Whether to return the file metadata or return response as normal.
 * @returns {Promise<void>}
 */
const processImageFile = async ({ req, res, metadata, returnFile = false }) => {
  const { file } = req;
  const appConfig = req.config;
  const source = getFileStrategy(appConfig, { isImage: true });
  const { handleImageUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id, endpoint } = metadata;

  const { filepath, bytes, width, height, storageKey, storageRegion } = await handleImageUpload({
    req,
    file,
    file_id,
    endpoint,
  });
  const storageMetadata = getStorageMetadata({ filepath, source, storageKey, storageRegion });

  const result = await createFileWithStorageLimit(
    req,
    {
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      ...storageMetadata,
      filename: file.originalname,
      context: FileContext.message_attachment,
      source,
      type: `image/${appConfig.imageOutputType}`,
      ...(await getRetentionExpiry(req)),
      width,
      height,
      tenantId: req.user.tenantId,
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
 * @param {ServerRequest} params.req - The Express request object.
 * @param {FileContext} params.context - The context of the file (e.g., 'avatar', 'image_generation', etc.)
 * @param {boolean} [params.resize=true] - Whether to resize and convert the image to target format. Default is `true`.
 * @param {{ buffer: Buffer, width: number, height: number, bytes: number, filename: string, type: string, file_id: string }} [params.metadata] - Required metadata for the file if resize is false.
 * @returns {Promise<{ filepath: string, filename: string, source: string, type: string}>}
 */
const uploadImageBuffer = async ({ req, context, metadata = {}, resize = true }) => {
  const appConfig = req.config;
  const source = getFileStrategy(appConfig, { isImage: true });
  const { saveBuffer } = getStrategyFunctions(source);
  let { buffer, width, height, bytes, filename, file_id, type } = metadata;
  if (resize) {
    file_id = v4();
    type = `image/${appConfig.imageOutputType}`;
    ({ buffer, width, height, bytes } = await resizeAndConvert({
      inputBuffer: buffer,
      desiredFormat: appConfig.imageOutputType,
    }));
    filename = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.${
      appConfig.imageOutputType
    }`;
  }
  const fileName = `${file_id}-${filename}`;
  await assertUploadStorageLimit(req, bytes, { excludeFileId: file_id });
  const filepath = await saveBuffer({
    userId: req.user.id,
    fileName,
    buffer,
    tenantId: req.user.tenantId,
  });
  const storageMetadata = getStorageMetadata({ filepath, source });
  return await createFileWithStorageLimit(
    req,
    {
      user: req.user.id,
      file_id,
      bytes,
      filepath,
      ...storageMetadata,
      filename,
      context,
      source,
      type,
      width,
      ...(await getRetentionExpiry(req)),
      height,
      tenantId: req.user.tenantId,
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
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {FileMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const processFileUpload = async ({ req, res, metadata }) => {
  const appConfig = req.config;
  const isAssistantUpload = isAssistantsEndpoint(metadata.endpoint);
  const assistantSource =
    metadata.endpoint === EModelEndpoint.azureAssistants ? FileSources.azure : FileSources.openai;
  // Use the configured file strategy for regular file uploads (not vectordb)
  const source = isAssistantUpload ? assistantSource : appConfig.fileStrategy;
  const { handleFileUpload } = getStrategyFunctions(source);
  const { file_id, temp_file_id = null } = metadata;
  const { file } = req;

  await assertUploadStorageLimit(req, file?.size, { excludeFileId: file_id });

  /** @type {OpenAI | undefined} */
  let openai;
  if (checkOpenAIStorage(source)) {
    ({ openai } = await getOpenAIClient({ req }));
  }

  const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
  const {
    id,
    bytes,
    filename,
    filepath: _filepath,
    storageKey: _storageKey,
    storageRegion: _storageRegion,
    embedded,
    height,
    width,
  } = await sanitizedUploadFn({
    req,
    file,
    file_id,
    openai,
  });

  const assistantFileId = id ?? file_id;
  if (isAssistantUpload && !metadata.message_file && !metadata.tool_resource) {
    await openai.beta.assistants.files.create(metadata.assistant_id, {
      file_id: assistantFileId,
    });
  } else if (isAssistantUpload && !metadata.message_file) {
    await addResourceFileId({
      req,
      openai,
      file_id: assistantFileId,
      assistant_id: metadata.assistant_id,
      tool_resource: metadata.tool_resource,
    });
  }

  const assistantStoredFile = isAssistantUpload
    ? {
        user: req.user.id,
        file_id: assistantFileId,
        bytes,
        filepath: `${openai.baseURL}/files/${assistantFileId}`,
        filename: filename ?? sanitizeFilename(file.originalname),
        source,
        tenantId: req.user.tenantId,
      }
    : null;
  let filepath = isAssistantUpload ? `${openai.baseURL}/files/${assistantFileId}` : _filepath;
  let storageMetadata = getStorageMetadata({
    filepath,
    source,
    storageKey: _storageKey,
    storageRegion: _storageRegion,
  });
  let imageFile;
  if (isAssistantUpload && file.mimetype.startsWith('image')) {
    try {
      imageFile = await processImageFile({
        req,
        file,
        metadata: { file_id: v4() },
        returnFile: true,
      });
    } catch (error) {
      if (isFileStorageLimitError(error)) {
        await cleanupAssistantStoredFile({ req, metadata, openai, file: assistantStoredFile });
      }
      throw error;
    }
    filepath = imageFile.filepath;
    storageMetadata = getStorageMetadata({
      filepath,
      source: imageFile.source,
      storageKey: imageFile.storageKey,
      storageRegion: imageFile.storageRegion,
    });
  }

  const fileInfo = {
    user: req.user.id,
    file_id: assistantFileId,
    temp_file_id,
    bytes,
    filepath,
    ...storageMetadata,
    filename: filename ?? sanitizeFilename(file.originalname),
    context: isAssistantUpload ? FileContext.assistants : FileContext.message_attachment,
    model: isAssistantUpload ? req.body.model : undefined,
    type: file.mimetype,
    ...(await getRetentionExpiry(req)),
    embedded,
    source,
    height,
    width,
    tenantId: req.user.tenantId,
  };

  let result;
  try {
    result = await createFileWithStorageLimit(req, fileInfo, true, {
      openai,
      cleanup: !isAssistantUpload,
    });
  } catch (error) {
    if (isFileStorageLimitError(error) && isAssistantUpload) {
      if (imageFile) {
        await cleanupPersistedFile({ req, file: imageFile });
      }
      await cleanupAssistantStoredFile({ req, metadata, openai, file: fileInfo });
    }
    throw error;
  }
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

/**
 * Applies the current strategy for file uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {FileMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const processAgentFileUpload = async ({ req, res, metadata }) => {
  const { file } = req;
  const appConfig = req.config;
  const { agent_id, tool_resource, file_id, temp_file_id = null } = metadata;

  if (tool_resource !== EToolResources.context) {
    await assertUploadStorageLimit(req, file?.size, { excludeFileId: file_id });
  }

  let messageAttachment = !!metadata.message_file;

  if (agent_id && !tool_resource && !messageAttachment) {
    throw new Error('No tool resource provided for agent file upload');
  }

  if (tool_resource === EToolResources.file_search && file.mimetype.startsWith('image')) {
    throw new Error('Image uploads are not supported for file search tool resources');
  }

  if (!messageAttachment && !agent_id) {
    throw new Error('No agent ID provided for agent file upload');
  }

  const isImage = file.mimetype.startsWith('image');
  let fileInfoMetadata;
  const entity_id = messageAttachment === true ? undefined : agent_id;
  const basePath = mime.getType(file.originalname)?.startsWith('image') ? 'images' : 'uploads';
  if (tool_resource === EToolResources.execute_code) {
    const isCodeEnabled = await checkCapability(req, AgentCapabilities.execute_code);
    if (!isCodeEnabled) {
      throw new Error('Code execution is not enabled for Agents');
    }
    const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(FileSources.execute_code);
    const stream = fs.createReadStream(file.path);
    /* Resource identity for codeapi's sessionKey:
     * - chat attachments (messageAttachment=true): `kind: 'user'`, codeapi
     *   buckets under `<tenant>:user:<authContext.userId>` regardless of `id`.
     * - agent setup files (messageAttachment=false): `kind: 'agent'`, shared
     *   per agent identity. `id` carries the agent id. */
    const codeKind = messageAttachment === true ? 'user' : 'agent';
    const codeId = messageAttachment === true ? req.user.id : agent_id;
    /* Upload under the same sanitized filename LC stores in its DB
     * (`fileInfo.filename` below uses `sanitizeFilename(originalname)`).
     * Codeapi/file_server use this as the on-disk name in the sandbox
     * — `/mnt/data/<filename>` — and `primeFiles`'s `toolContext` text
     * + `_injected_files.name` both reference `file.filename`. Sending
     * the unsanitized `file.originalname` here makes the sandbox path
     * (with spaces / special chars) drift from what LC tells the model
     * is available, causing FileNotFoundError on the first reference. */
    const sandboxFilename = sanitizeFilename(file.originalname);
    const uploaded = await uploadCodeEnvFile({
      req,
      stream,
      filename: sandboxFilename,
      kind: codeKind,
      id: codeId,
    });
    /* Persist under the structured `codeEnvRef` shape — the only key the
     * post-cutover schema (`metadata.codeEnvRef`) and downstream readers
     * (`primeFiles`, `getCodeFilesByIds`, `categorizeFileForToolResources`,
     * controller filtering) accept. Storing under the legacy
     * `fileIdentifier` key would be silently dropped by mongoose strict
     * mode and the file would lose its sandbox reference on subsequent
     * priming turns. */
    fileInfoMetadata = {
      codeEnvRef: {
        kind: codeKind,
        id: codeId,
        storage_session_id: uploaded.storage_session_id,
        file_id: uploaded.file_id,
      },
    };
  } else if (tool_resource === EToolResources.file_search) {
    const isFileSearchEnabled = await checkCapability(req, AgentCapabilities.file_search);
    if (!isFileSearchEnabled) {
      throw new Error('File search is not enabled for Agents');
    }
    // Note: File search processing continues to dual storage logic below
  } else if (tool_resource === EToolResources.context) {
    const { file_id, temp_file_id = null } = metadata;

    /**
     * @param {object} params
     * @param {string} params.text
     * @param {number} params.bytes
     * @param {string} params.filepath
     * @param {string} params.type
     * @return {Promise<void>}
     */
    const createTextFile = async ({ text, bytes, filepath, type = 'text/plain' }) => {
      const textBytes = Buffer.byteLength(text, 'utf8');
      if (textBytes > 15 * megabyte) {
        throw new Error(
          `Extracted text from "${file.originalname}" exceeds the 15MB storage limit (${Math.round(textBytes / megabyte)}MB). Try a shorter document.`,
        );
      }
      const retentionExpiry = await getRetentionExpiry(req);
      const fileInfo = {
        ...removeNullishValues({
          text,
          bytes,
          file_id,
          temp_file_id,
          user: req.user.id,
          type,
          filepath: filepath ?? file.path,
          source: FileSources.text,
          filename: file.originalname,
          model: messageAttachment ? undefined : req.body.model,
          context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
          tenantId: req.user.tenantId,
        }),
        ...retentionExpiry,
      };

      const result = await createFileWithStorageLimit(req, fileInfo, true, { cleanup: false });
      if (!messageAttachment && tool_resource) {
        try {
          await db.addAgentResourceFile({
            file_id,
            agent_id,
            tool_resource,
            updatingUserId: req?.user?.id,
          });
        } catch (error) {
          await cleanupFileMetadata({ fileId: file_id });
          throw error;
        }
      }
      return res
        .status(200)
        .json({ message: 'Agent file uploaded and processed successfully', ...result });
    };

    const fileConfig = mergeFileConfig(appConfig.fileConfig);

    const shouldUseConfiguredOCR =
      appConfig?.ocr != null &&
      fileConfig.checkType(file.mimetype, fileConfig.ocr?.supportedMimeTypes || []);

    const shouldUseDocumentParser =
      !shouldUseConfiguredOCR && documentParserMimeTypes.some((regex) => regex.test(file.mimetype));

    const shouldUseOCR = shouldUseConfiguredOCR || shouldUseDocumentParser;

    const resolveDocumentText = async () => {
      if (shouldUseConfiguredOCR) {
        try {
          const ocrStrategy = appConfig?.ocr?.strategy ?? FileSources.document_parser;
          const { handleFileUpload } = getStrategyFunctions(ocrStrategy);
          return await handleFileUpload({ req, file, loadAuthValues });
        } catch (err) {
          logger.error(
            `[processAgentFileUpload] Configured OCR failed for "${file.originalname}", falling back to document_parser:`,
            err,
          );
        }
      }
      try {
        const { handleFileUpload } = getStrategyFunctions(FileSources.document_parser);
        return await handleFileUpload({ req, file, loadAuthValues });
      } catch (err) {
        logger.error(
          `[processAgentFileUpload] Document parser failed for "${file.originalname}":`,
          err,
        );
      }
    };

    if (shouldUseConfiguredOCR && !(await checkCapability(req, AgentCapabilities.ocr))) {
      throw new Error('OCR capability is not enabled for Agents');
    }

    if (shouldUseOCR) {
      const ocrResult = await resolveDocumentText();
      if (ocrResult) {
        const { text, bytes, filepath: ocrFileURL } = ocrResult;
        return await createTextFile({ text, bytes, filepath: ocrFileURL });
      }
      throw new Error(
        `Unable to extract text from "${file.originalname}". The document may be image-based and requires an OCR service to process.`,
      );
    }

    const shouldUseSTT = fileConfig.checkType(
      file.mimetype,
      fileConfig.stt?.supportedMimeTypes || [],
    );

    if (shouldUseSTT) {
      const sttService = await STTService.getInstance();
      const { text, bytes } = await processAudioFile({ req, file, sttService });
      return await createTextFile({ text, bytes });
    }

    const shouldUseText = fileConfig.checkType(
      file.mimetype,
      fileConfig.text?.supportedMimeTypes || [],
    );

    if (!shouldUseText) {
      throw new Error(`File type ${file.mimetype} is not supported for text parsing.`);
    }

    const { text, bytes } = await parseText({ req, file, file_id });
    return await createTextFile({ text, bytes, type: file.mimetype });
  }

  // Dual storage pattern for RAG files: Storage + Vector DB
  let storageResult, embeddingResult;
  const isImageFile = file.mimetype.startsWith('image');
  const source = getFileStrategy(appConfig, { isImage: isImageFile });

  if (tool_resource === EToolResources.file_search) {
    // FIRST: Upload to Storage for permanent backup (S3/local/etc.)
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
    storageResult = await sanitizedUploadFn({
      req,
      file,
      file_id,
      basePath,
      entity_id,
    });

    try {
      await assertUploadStorageLimit(req, storageResult.bytes, { excludeFileId: file_id });
    } catch (error) {
      if (isFileStorageLimitError(error)) {
        await cleanupStoredFile({
          req,
          file: {
            file_id,
            filepath: storageResult.filepath,
            storageKey: storageResult.storageKey,
            storageRegion: storageResult.storageRegion,
            source,
            tenantId: req.user.tenantId,
          },
        });
      }
      throw error;
    }

    // SECOND: Upload to Vector DB
    const { uploadVectors } = require('./VectorDB/crud');

    embeddingResult = await uploadVectors({
      req,
      file,
      file_id,
      entity_id,
    });

    // Vector status will be stored at root level, no need for metadata
    fileInfoMetadata = {};
  } else {
    // Standard single storage for non-RAG files
    const { handleFileUpload } = getStrategyFunctions(source);
    const sanitizedUploadFn = createSanitizedUploadWrapper(handleFileUpload);
    storageResult = await sanitizedUploadFn({
      req,
      file,
      file_id,
      basePath,
      entity_id,
    });
  }

  let {
    bytes,
    filename,
    filepath: _filepath,
    storageKey: _storageKey,
    storageRegion: _storageRegion,
    height,
    width,
  } = storageResult;
  // For RAG files, use embedding result; for others, use storage result
  let embedded = storageResult.embedded;
  if (tool_resource === EToolResources.file_search) {
    embedded = embeddingResult?.embedded;
    filename = embeddingResult?.filename || filename;
  }

  let filepath = _filepath;
  let fileSource = source;
  let fileType = file.mimetype;
  const originalStoredFile = {
    file_id,
    bytes,
    filepath,
    storageKey: _storageKey,
    storageRegion: _storageRegion,
    source,
    tenantId: req.user.tenantId,
  };
  let storageMetadata = getStorageMetadata({
    filepath,
    source,
    storageKey: _storageKey,
    storageRegion: _storageRegion,
  });

  let imageFile;
  if (isImage) {
    try {
      imageFile = await processImageFile({
        req,
        file,
        metadata: { file_id: v4() },
        returnFile: true,
      });
    } catch (error) {
      if (isFileStorageLimitError(error)) {
        await cleanupStoredFile({ req, file: originalStoredFile });
      }
      throw error;
    }
    filepath = imageFile.filepath;
    bytes = imageFile.bytes ?? bytes;
    height = imageFile.height ?? height;
    width = imageFile.width ?? width;
    fileSource = imageFile.source ?? source;
    fileType = imageFile.type ?? file.mimetype;
    storageMetadata = getStorageMetadata({
      filepath,
      source: fileSource,
      storageKey: imageFile.storageKey,
      storageRegion: imageFile.storageRegion,
    });
  }

  const retentionExpiry = await getRetentionExpiry(req);
  const fileInfo = {
    ...removeNullishValues({
      user: req.user.id,
      file_id,
      temp_file_id,
      bytes,
      filepath,
      ...storageMetadata,
      filename: filename ?? sanitizeFilename(file.originalname),
      context: messageAttachment ? FileContext.message_attachment : FileContext.agents,
      model: messageAttachment ? undefined : req.body.model,
      metadata: fileInfoMetadata,
      type: fileType,
      embedded,
      source: fileSource,
      height,
      width,
      tenantId: req.user.tenantId,
    }),
    ...retentionExpiry,
  };

  let result;
  try {
    result = await createFileWithStorageLimit(req, fileInfo, true);
  } catch (error) {
    if (isFileStorageLimitError(error)) {
      if (imageFile) {
        await cleanupPersistedFile({ req, file: imageFile });
        await cleanupStoredFile({ req, file: originalStoredFile });
      }
      if (tool_resource === EToolResources.file_search && embedded) {
        await cleanupVectorFile({ req, file: fileInfo });
      }
      if (tool_resource === EToolResources.execute_code) {
        await cleanupCodeEnvFile({ req, file: fileInfo });
      }
    }
    throw error;
  }
  if (!messageAttachment && tool_resource) {
    try {
      await db.addAgentResourceFile({
        file_id,
        agent_id,
        tool_resource,
        updatingUserId: req?.user?.id,
      });
    } catch (error) {
      if (imageFile) {
        await cleanupFileMetadata({ fileId: fileInfo.file_id });
        await cleanupPersistedFile({ req, file: imageFile });
        await cleanupStoredFile({ req, file: originalStoredFile });
      } else {
        await cleanupPersistedFile({ req, file: fileInfo });
      }
      if (tool_resource === EToolResources.file_search && embedded) {
        await cleanupVectorFile({ req, file: fileInfo });
      }
      if (tool_resource === EToolResources.execute_code) {
        await cleanupCodeEnvFile({ req, file: fileInfo });
      }
      throw error;
    }
  }

  res.status(200).json({ message: 'Agent file uploaded and processed successfully', ...result });
};

/**
 * @param {object} params - The params object.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {ServerRequest} params.req - The Express request object associated with the client.
 * @param {string} params.file_id - The ID of the file to retrieve.
 * @param {string} params.userId - The user ID.
 * @param {string} [params.filename] - The name of the file. `undefined` for `file_citation` annotations.
 * @param {boolean} [params.saveFile=false] - Whether to save the file metadata to the database.
 * @param {boolean} [params.updateUsage=false] - Whether to update file usage in database.
 */
const processOpenAIFile = async ({
  openai,
  req,
  file_id,
  userId,
  filename,
  saveFile = false,
  updateUsage = false,
}) => {
  const request = req ?? openai.req;
  const _file = await openai.files.retrieve(file_id);
  const originalName = filename ?? (_file.filename ? path.basename(_file.filename) : undefined);
  const filepath = `${openai.baseURL}/files/${userId}/${file_id}${
    originalName ? `/${originalName}` : ''
  }`;
  const type = mime.getType(originalName ?? file_id);
  const source =
    request.body.endpoint === EModelEndpoint.azureAssistants
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
    model: request.body.model,
    filename: originalName ?? file_id,
    ...(await getRetentionExpiry(request)),
    tenantId: request.user?.tenantId,
  };

  if (saveFile) {
    await createFileWithStorageLimit(request, file, true, { cleanup: false });
  } else if (updateUsage) {
    try {
      await db.updateFileUsage({ file_id });
    } catch (error) {
      logger.error('Error updating file usage', error);
    }
  }

  return file;
};

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {object} params - The params object.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Buffer} params.buffer - The image buffer.
 * @param {string} params.file_id - The file ID.
 * @param {string} params.filename - The filename.
 * @param {string} params.fileExt - The file extension.
 * @returns {Promise<MongoFile>} The file metadata.
 */
const processOpenAIImageOutput = async ({ req, buffer, file_id, filename, fileExt }) => {
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString();
  const appConfig = req.config;
  const _file = await convertImage(req, buffer, undefined, `${file_id}${fileExt}`);

  // Create only one file record with the correct information
  const file = {
    ..._file,
    usage: 1,
    user: req.user.id,
    type: mime.getType(fileExt),
    createdAt: formattedDate,
    updatedAt: formattedDate,
    source: appConfig.fileStrategy,
    context: FileContext.assistants_output,
    file_id,
    filename,
    ...(await getRetentionExpiry(req)),
    tenantId: req.user.tenantId,
  };
  try {
    await createFileWithStorageLimit(req, file, true);
  } catch (error) {
    if (isFileStorageLimitError(error)) {
      throw error;
    }
    logger.warn('Error saving OpenAI image output file metadata', error);
  }
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
  const processArgs = {
    openai,
    req: client.req,
    file_id,
    filename: basename,
    userId: client.req.user.id,
  };

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
 * Converts a base64 string to a buffer.
 * @param {string} base64String
 * @returns {Buffer<ArrayBufferLike>}
 */
function base64ToBuffer(base64String) {
  try {
    const typeMatch = base64String.match(/^data:([A-Za-z-+/]+);base64,/);
    const type = typeMatch ? typeMatch[1] : '';

    const base64Data = base64String.replace(/^data:([A-Za-z-+/]+);base64,/, '');

    if (!base64Data) {
      throw new Error('Invalid base64 string');
    }

    return {
      buffer: Buffer.from(base64Data, 'base64'),
      type,
    };
  } catch (error) {
    throw new Error(`Failed to convert base64 to buffer: ${error.message}`);
  }
}

async function saveBase64Image(
  url,
  { req, file_id: _file_id, filename: _filename, endpoint, context, resolution },
) {
  const appConfig = req.config;
  const effectiveResolution = resolution ?? appConfig.fileConfig?.imageGeneration ?? 'high';
  const file_id = _file_id ?? v4();
  let filename = `${file_id}-${_filename}`;
  const { buffer: inputBuffer, type } = base64ToBuffer(url);
  if (!path.extname(_filename)) {
    const extension = mime.getExtension(type);
    if (extension) {
      filename += `.${extension}`;
    } else {
      throw new Error(`Could not determine file extension from MIME type: ${type}`);
    }
  }

  const image = await resizeImageBuffer(inputBuffer, effectiveResolution, endpoint);
  const source = getFileStrategy(appConfig, { isImage: true });
  const { saveBuffer } = getStrategyFunctions(source);
  await assertUploadStorageLimit(req, image.bytes, { excludeFileId: file_id });
  const filepath = await saveBuffer({
    userId: req.user.id,
    fileName: filename,
    buffer: image.buffer,
    tenantId: req.user.tenantId,
  });
  const storageMetadata = getStorageMetadata({ filepath, source });
  return await createFileWithStorageLimit(
    req,
    {
      type,
      source,
      context,
      file_id,
      filepath,
      ...storageMetadata,
      filename,
      user: req.user.id,
      bytes: image.bytes,
      width: image.width,
      ...(await getRetentionExpiry(req)),
      height: image.height,
      tenantId: req.user.tenantId,
    },
    true,
  );
}

/**
 * Filters a file based on its size and the endpoint origin.
 *
 * @param {Object} params - The parameters for the function.
 * @param {ServerRequest} params.req - The request object from Express.
 * @param {string} [params.req.endpoint]
 * @param {string} [params.req.file_id]
 * @param {number} [params.req.width]
 * @param {number} [params.req.height]
 * @param {number} [params.req.version]
 * @param {boolean} [params.image] - Whether the file expected is an image.
 * @param {boolean} [params.isAvatar] - Whether the file expected is a user or entity avatar.
 * @returns {void}
 *
 * @throws {Error} If a file exception is caught (invalid file size or type, lack of metadata).
 */
function filterFile({ req, image, isAvatar }) {
  const { file } = req;
  const { endpoint, endpointType, file_id, width, height } = req.body;

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

  const appConfig = req.config;
  const fileConfig = mergeFileConfig(appConfig.fileConfig);

  const endpointFileConfig = getEndpointFileConfig({
    endpoint,
    fileConfig,
    endpointType,
  });
  const fileSizeLimit =
    isAvatar === true ? fileConfig.avatarSizeLimit : endpointFileConfig.fileSizeLimit;

  if (file.size > fileSizeLimit) {
    throw new Error(
      `File size limit of ${fileSizeLimit / megabyte} MB exceeded for ${
        isAvatar ? 'avatar upload' : `${endpoint} endpoint`
      }`,
    );
  }

  const isSupportedMimeType = fileConfig.checkType(
    file.mimetype,
    endpointFileConfig.supportedMimeTypes,
  );

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
  processFileURL,
  saveBase64Image,
  processImageFile,
  uploadImageBuffer,
  sweepExpiredFiles,
  startExpiredFileSweep,
  processFileUpload,
  processDeleteRequest,
  processAgentFileUpload,
  retrieveAndProcessFile,
};
