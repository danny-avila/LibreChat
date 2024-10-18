const path = require('path');
const { v4 } = require('uuid');
const axios = require('axios');
const { getCodeBaseURL, EnvVar } = require('@librechat/agents');
const { FileContext, imageExtRegex } = require('librechat-data-provider');
const { convertImage } = require('~/server/services/Files/images/convert');
const { loadAuthValues } = require('~/app/clients/tools/util');
const { createFile } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {string} params.id - The file ID.
 * @param {string} params.name - The filename.
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
    const result = await loadAuthValues({ userId: req.user.id, authFields: [EnvVar.CODE_API_KEY] });
    const response = await axios({
      method: 'get',
      url: `${baseURL}/download/${session_id}/${id}`,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': result[EnvVar.CODE_API_KEY],
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

module.exports = {
  processCodeOutput,
};
