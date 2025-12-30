const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { FileContext } = require('librechat-data-provider');
const { createFile } = require('~/models/File');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

/**
 * Map file extensions to MIME types
 * @param {string} ext - File extension
 * @returns {string} MIME type
 */
function getMimeTypeFromExtension(ext) {
  const mimeTypes = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Data formats
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    // Web
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    // Archives
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    // Audio/Video
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
  };

  const normalizedExt = ext.toLowerCase();
  return mimeTypes[normalizedExt] || 'application/octet-stream';
}

/**
 * Saves extracted files to LibreChat storage.
 * Reuses existing storage strategies (S3/Firebase/local).
 *
 * @param {Array} extractedFiles - Files extracted from Piston stdout
 * @param {string} userId - User ID for file ownership
 * @param {string} conversationId - Conversation ID for context
 * @param {Object} req - Server request object
 * @returns {Promise<Array>} Array of saved file objects matching LibreChat format
 */
async function saveExtractedFiles(extractedFiles, userId, conversationId, req) {
  const savedFiles = [];

  if (!extractedFiles || extractedFiles.length === 0) {
    return savedFiles;
  }

  for (const extracted of extractedFiles) {
    try {
      const file_id = uuidv4();

      // 1. Decode content based on encoding
      const buffer =
        extracted.encoding === 'base64'
          ? Buffer.from(extracted.content, 'base64')
          : Buffer.from(extracted.content, 'utf8');

      // 2. Determine MIME type from file extension
      const ext = path.extname(extracted.filename);
      const mimeType = getMimeTypeFromExtension(ext);

      // 3. Save using existing storage strategy
      const fileStrategy = req.app.locals.fileStrategy || req.config?.fileStrategy;

      let storagePath;

      if (fileStrategy === 'local') {
        // For local storage, save directly like uploadLocalFile does
        const appConfig = req.config;
        const { uploads } = appConfig.paths;
        const userPath = path.join(uploads, userId);

        if (!fs.existsSync(userPath)) {
          fs.mkdirSync(userPath, { recursive: true });
        }

        const fileName = `${file_id}__${extracted.filename}`;
        const fullPath = path.join(userPath, fileName);

        await fs.promises.writeFile(fullPath, buffer);
        storagePath = path.posix.join('/', 'uploads', userId, fileName);
      } else {
        // For S3/Firebase/Azure, use saveBuffer
        const { saveBuffer } = getStrategyFunctions(fileStrategy);
        storagePath = await saveBuffer({
          userId: userId,
          buffer,
          fileName: extracted.filename,
          basePath: 'uploads',
        });
      }

      const currentDate = new Date();
      const formattedDate = currentDate.toISOString();

      // 4. Save metadata to DB
      const file = {
        file_id,
        user: userId,
        conversationId,
        filename: extracted.filename,
        filepath: storagePath, // Storage path for getDownloadStream to use
        type: mimeType,
        bytes: buffer.length,
        source: fileStrategy,
        context: FileContext.execute_code,
        usage: 1,
        createdAt: formattedDate,
        updatedAt: formattedDate,
        embedded: false,
        object: 'file',
      };

      await createFile(file, true);
      savedFiles.push(file);

      logger.info(`[Piston] Saved extracted file: ${extracted.filename} (${file_id})`);
    } catch (error) {
      logger.error(`[Piston] Error saving extracted file ${extracted.filename}:`, error);
      // Continue with other files even if one fails
    }
  }

  return savedFiles;
}

module.exports = {
  saveExtractedFiles,
  getMimeTypeFromExtension,
};
