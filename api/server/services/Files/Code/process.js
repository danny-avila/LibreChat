const path = require('path');
const { v4 } = require('uuid');
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { getCodeBaseURL } = require('@librechat/agents');
const { logAxiosError, getBasePath } = require('@librechat/api');
const {
  Tools,
  megabyte,
  fileConfig,
  FileContext,
  FileSources,
  imageExtRegex,
  inferMimeType,
  EToolResources,
  EModelEndpoint,
  mergeFileConfig,
  getEndpointFileConfig,
} = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { createFile, getFiles, updateFile, claimCodeFile } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { determineFileType } = require('~/server/utils');

/**
 * Creates a fallback download URL response when file cannot be processed locally.
 * Used when: file exceeds size limit, storage strategy unavailable, or download error occurs.
 * @param {Object} params - The parameters.
 * @param {string} params.name - The filename.
 * @param {string} params.session_id - The code execution session ID.
 * @param {string} params.id - The file ID from the code environment.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.toolCallId - The tool call ID that generated the file.
 * @param {string} params.messageId - The current message ID.
 * @param {number} params.expiresAt - Expiration timestamp (24 hours from creation).
 * @returns {Object} Fallback response with download URL.
 */
const createDownloadFallback = ({
  id,
  name,
  messageId,
  expiresAt,
  session_id,
  toolCallId,
  conversationId,
}) => {
  const basePath = getBasePath();
  return {
    filename: name,
    filepath: `${basePath}/api/files/code/download/${session_id}/${id}`,
    expiresAt,
    conversationId,
    toolCallId,
    messageId,
  };
};

/**
 * Process code execution output files - downloads and saves both images and non-image files.
 * All files are saved to local storage with fileIdentifier metadata for code env re-upload.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {string} params.id - The file ID from the code environment.
 * @param {string} params.name - The filename.
 * @param {string} params.apiKey - The code execution API key.
 * @param {string} params.toolCallId - The tool call ID that generated the file.
 * @param {string} params.session_id - The code execution session ID.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.messageId - The current message ID.
 * @returns {Promise<MongoFile & { messageId: string, toolCallId: string } | undefined>} The file metadata or undefined if an error occurs.
 */
const processCodeOutput = async ({
  req,
  id,
  name,
  apiKey,
  toolCallId,
  conversationId,
  messageId,
  session_id,
}) => {
  const appConfig = req.config;
  const currentDate = new Date();
  const baseURL = getCodeBaseURL();
  const fileExt = path.extname(name).toLowerCase();
  const isImage = fileExt && imageExtRegex.test(name);

  const mergedFileConfig = mergeFileConfig(appConfig.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  const fileSizeLimit = endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit;

  try {
    const formattedDate = currentDate.toISOString();
    const response = await axios({
      method: 'get',
      url: `${baseURL}/download/${session_id}/${id}`,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      timeout: 15000,
    });

    const buffer = Buffer.from(response.data, 'binary');

    // Enforce file size limit
    if (buffer.length > fileSizeLimit) {
      logger.warn(
        `[processCodeOutput] File "${name}" (${(buffer.length / megabyte).toFixed(2)} MB) exceeds size limit of ${(fileSizeLimit / megabyte).toFixed(2)} MB, falling back to download URL`,
      );
      return createDownloadFallback({
        id,
        name,
        messageId,
        toolCallId,
        session_id,
        conversationId,
        expiresAt: currentDate.getTime() + 86400000,
      });
    }

    const fileIdentifier = `${session_id}/${id}`;

    /**
     * Atomically claim a file_id for this (filename, conversationId, context) tuple.
     * Uses $setOnInsert so concurrent calls for the same filename converge on
     * a single record instead of creating duplicates (TOCTOU race fix).
     */
    const newFileId = v4();
    const claimed = await claimCodeFile({
      filename: name,
      conversationId,
      file_id: newFileId,
      user: req.user.id,
    });
    const file_id = claimed.file_id;
    const isUpdate = file_id !== newFileId;

    if (isUpdate) {
      logger.debug(
        `[processCodeOutput] Updating existing file "${name}" (${file_id}) instead of creating duplicate`,
      );
    }

    if (isImage) {
      const usage = isUpdate ? (claimed.usage ?? 0) + 1 : 1;
      const _file = await convertImage(req, buffer, 'high', `${file_id}${fileExt}`);
      const filepath = usage > 1 ? `${_file.filepath}?v=${Date.now()}` : _file.filepath;
      const file = {
        ..._file,
        filepath,
        file_id,
        messageId,
        usage,
        filename: name,
        conversationId,
        user: req.user.id,
        type: `image/${appConfig.imageOutputType}`,
        createdAt: isUpdate ? claimed.createdAt : formattedDate,
        updatedAt: formattedDate,
        source: appConfig.fileStrategy,
        context: FileContext.execute_code,
        metadata: { fileIdentifier },
      };
      await createFile(file, true);
      return Object.assign(file, { messageId, toolCallId });
    }

    const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
    if (!saveBuffer) {
      logger.warn(
        `[processCodeOutput] saveBuffer not available for strategy ${appConfig.fileStrategy}, falling back to download URL`,
      );
      return createDownloadFallback({
        id,
        name,
        messageId,
        toolCallId,
        session_id,
        conversationId,
        expiresAt: currentDate.getTime() + 86400000,
      });
    }

    const detectedType = await determineFileType(buffer, true);
    const mimeType = detectedType?.mime || inferMimeType(name, '') || 'application/octet-stream';

    /** Check MIME type support - for code-generated files, we're lenient but log unsupported types */
    const isSupportedMimeType = fileConfig.checkType(
      mimeType,
      endpointFileConfig.supportedMimeTypes,
    );
    if (!isSupportedMimeType) {
      logger.warn(
        `[processCodeOutput] File "${name}" has unsupported MIME type "${mimeType}", proceeding with storage but may not be usable as tool resource`,
      );
    }

    const fileName = `${file_id}__${name}`;
    const filepath = await saveBuffer({
      userId: req.user.id,
      buffer,
      fileName,
      basePath: 'uploads',
    });

    const file = {
      file_id,
      filepath,
      messageId,
      object: 'file',
      filename: name,
      type: mimeType,
      conversationId,
      user: req.user.id,
      bytes: buffer.length,
      updatedAt: formattedDate,
      metadata: { fileIdentifier },
      source: appConfig.fileStrategy,
      context: FileContext.execute_code,
      usage: isUpdate ? (claimed.usage ?? 0) + 1 : 1,
      createdAt: isUpdate ? claimed.createdAt : formattedDate,
    };

    await createFile(file, true);
    return Object.assign(file, { messageId, toolCallId });
  } catch (error) {
    logAxiosError({
      message: 'Error downloading/processing code environment file',
      error,
    });

    // Fallback for download errors - return download URL so user can still manually download
    return createDownloadFallback({
      id,
      name,
      messageId,
      toolCallId,
      session_id,
      conversationId,
      expiresAt: currentDate.getTime() + 86400000,
    });
  }
};

function checkIfActive(dateString) {
  const givenDate = new Date(dateString);
  const currentDate = new Date();
  const timeDifference = currentDate - givenDate;
  const hoursPassed = timeDifference / (1000 * 60 * 60);
  return hoursPassed < 23;
}

/**
 * Retrieves the `lastModified` time string for a specified file from Code Execution Server.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.fileIdentifier - The identifier for the file (e.g., "session_id/fileId").
 * @param {string} params.apiKey - The API key for authentication.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the `lastModified` time string of the file if successful, or null if there is an
 *          error in initialization or fetching the info.
 */
async function getSessionInfo(fileIdentifier, apiKey) {
  try {
    const baseURL = getCodeBaseURL();
    const [path, queryString] = fileIdentifier.split('?');
    const session_id = path.split('/')[0];

    let queryParams = {};
    if (queryString) {
      queryParams = Object.fromEntries(new URLSearchParams(queryString).entries());
    }

    const response = await axios({
      method: 'get',
      url: `${baseURL}/files/${session_id}`,
      params: {
        detail: 'summary',
        ...queryParams,
      },
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      timeout: 5000,
    });

    return response.data.find((file) => file.name.startsWith(path))?.lastModified;
  } catch (error) {
    logAxiosError({
      message: `Error fetching session info: ${error.message}`,
      error,
    });
    return null;
  }
}

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @param {string} apiKey
 * @returns {Promise<{
 * files: Array<{ id: string; session_id: string; name: string }>,
 * toolContext: string,
 * }>}
 */
const primeFiles = async (options, apiKey) => {
  const { tool_resources, req, agentId } = options;
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.execute_code]?.files ?? [];

  // Get all files first
  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  const files = [];
  const sessions = new Map();
  let toolContext = '';

  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }

    if (file.metadata.fileIdentifier) {
      const [path, queryString] = file.metadata.fileIdentifier.split('?');
      const [session_id, id] = path.split('/');

      const pushFile = () => {
        if (!toolContext) {
          toolContext = `- Note: The following files are available in the "${Tools.execute_code}" tool environment:`;
        }

        let fileSuffix = '';
        if (!agentResourceIds.has(file.file_id)) {
          fileSuffix =
            file.context === FileContext.execute_code
              ? ' (from previous code execution)'
              : ' (attached by user)';
        }

        toolContext += `\n\t- /mnt/data/${file.filename}${fileSuffix}`;
        files.push({
          id,
          session_id,
          name: file.filename,
        });
      };

      if (sessions.has(session_id)) {
        pushFile();
        continue;
      }

      let queryParams = {};
      if (queryString) {
        queryParams = Object.fromEntries(new URLSearchParams(queryString).entries());
      }

      const reuploadFile = async () => {
        try {
          const { getDownloadStream } = getStrategyFunctions(file.source);
          const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(
            FileSources.execute_code,
          );
          const stream = await getDownloadStream(options.req, file.filepath);
          const fileIdentifier = await uploadCodeEnvFile({
            req: options.req,
            stream,
            filename: file.filename,
            entity_id: queryParams.entity_id,
            apiKey,
          });

          // Preserve existing metadata when adding fileIdentifier
          const updatedMetadata = {
            ...file.metadata, // Preserve existing metadata (like S3 storage info)
            fileIdentifier, // Add fileIdentifier
          };

          await updateFile({
            file_id: file.file_id,
            metadata: updatedMetadata,
          });
          sessions.set(session_id, true);
          pushFile();
        } catch (error) {
          logger.error(
            `Error re-uploading file ${id} in session ${session_id}: ${error.message}`,
            error,
          );
        }
      };
      const uploadTime = await getSessionInfo(file.metadata.fileIdentifier, apiKey);
      if (!uploadTime) {
        logger.warn(`Failed to get upload time for file ${id} in session ${session_id}`);
        await reuploadFile();
        continue;
      }
      if (!checkIfActive(uploadTime)) {
        await reuploadFile();
        continue;
      }
      sessions.set(session_id, true);
      pushFile();
    }
  }

  return { files, toolContext };
};

module.exports = {
  primeFiles,
  processCodeOutput,
};
