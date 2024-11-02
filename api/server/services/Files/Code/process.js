const path = require('path');
const { v4 } = require('uuid');
const axios = require('axios');
const { getCodeBaseURL } = require('@librechat/agents');
const {
  EToolResources,
  FileContext,
  imageExtRegex,
  FileSources,
} = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { createFile, getFiles, updateFile } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {string} params.id - The file ID.
 * @param {string} params.name - The filename.
 * @param {string} params.apiKey - The code execution API key.
 * @param {string} params.toolCallId - The tool call ID that generated the file.
 * @param {string} params.session_id - The code execution session ID.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.messageId - The current message ID.
 * @returns {Promise<MongoFile & { messageId: string, toolCallId: string } | { filename: string; filepath: string; expiresAt: number; conversationId: string; toolCallId: string; messageId: string } | undefined>} The file metadata or undefined if an error occurs.
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
  const currentDate = new Date();
  const baseURL = getCodeBaseURL();
  const fileExt = path.extname(name);
  if (!fileExt || !imageExtRegex.test(name)) {
    return {
      filename: name,
      filepath: `/api/files/code/download/${session_id}/${id}`,
      /** Note: expires 24 hours after creation */
      expiresAt: currentDate.getTime() + 86400000,
      conversationId,
      toolCallId,
      messageId,
    };
  }

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

    const file_id = v4();
    const _file = await convertImage(req, buffer, 'high', `${file_id}${fileExt}`);
    const file = {
      ..._file,
      file_id,
      usage: 1,
      filename: name,
      conversationId,
      user: req.user.id,
      type: `image/${req.app.locals.imageOutputType}`,
      createdAt: formattedDate,
      updatedAt: formattedDate,
      source: req.app.locals.fileStrategy,
      context: FileContext.execute_code,
    };
    createFile(file, true);
    /** Note: `messageId` & `toolCallId` are not part of file DB schema; message object records associated file ID */
    return Object.assign(file, { messageId, toolCallId });
  } catch (error) {
    logger.error('Error downloading file:', error);
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
    const session_id = fileIdentifier.split('/')[0];
    const response = await axios({
      method: 'get',
      url: `${baseURL}/files/${session_id}`,
      params: {
        detail: 'summary',
      },
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      timeout: 5000,
    });

    return response.data.find((file) => file.name.startsWith(fileIdentifier))?.lastModified;
  } catch (error) {
    logger.error(`Error fetching session info: ${error.message}`, error);
    return null;
  }
}

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} apiKey
 * @returns {Promise<Array<{ id: string; session_id: string; name: string }>>}
 */
const primeFiles = async (options, apiKey) => {
  const { tool_resources } = options;
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const dbFiles = await getFiles({ file_id: { $in: file_ids } });

  const files = [];
  const sessions = new Map();
  for (const file of dbFiles) {
    if (file.metadata.fileIdentifier) {
      const [session_id, id] = file.metadata.fileIdentifier.split('/');
      const pushFile = () => {
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
      const reuploadFile = async () => {
        try {
          const { getDownloadStream } = getStrategyFunctions(file.source);
          const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(
            FileSources.execute_code,
          );
          const stream = await getDownloadStream(file.filepath);
          const fileIdentifier = await uploadCodeEnvFile({
            req: options.req,
            stream,
            filename: file.filename,
            apiKey,
          });
          await updateFile({ file_id: file.file_id, metadata: { fileIdentifier } });
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

  return files;
};

module.exports = {
  primeFiles,
  processCodeOutput,
};
