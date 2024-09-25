const path = require('path');
const { v4 } = require('uuid');
const axios = require('axios');
const { FileContext, imageExtRegex } = require('librechat-data-provider');
const { getCodeBaseURL, EnvVar } = require('@librechat/agents');
const { convertImage } = require('~/server/services/Files/images');
const { loadAuthValues } = require('~/app/clients/tools/util');
const { createFile } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Process OpenAI image files, convert to target format, save and return file metadata.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {string} params.id - The file ID.
 * @param {string} params.name - The filename.
 * @param {string} params.session_id - The code execution session ID.
 * @returns {Promise<MongoFile | { filename: string; filepath: string; expires: number}>} The file metadata.
 */
const processCodeOutput = async ({ req, id, name, session_id }) => {
  const currentDate = new Date();
  const baseURL = getCodeBaseURL();
  const fileExt = path.extname(name);
  if (!fileExt || !imageExtRegex.test(name)) {
    return {
      filename: name,
      filepath: `${baseURL}/${session_id}/${id}`,
      // expires 24 hours after creation
      expires: currentDate.getTime() + 86400000,
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
      user: req.user.id,
      type: `image/${req.app.locals.imageOutputType}`,
      createdAt: formattedDate,
      updatedAt: formattedDate,
      source: req.app.locals.fileStrategy,
      context: FileContext.execute_code,
    };
    createFile(file, true);
    return file;
  } catch (error) {
    logger.error('Error downloading file:', error);
  }
};

module.exports = {
  processCodeOutput,
};
