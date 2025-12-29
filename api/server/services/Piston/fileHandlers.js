const { logger } = require('@librechat/data-schemas');
const { getFiles } = require('~/models/File');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

/**
 * Convert a stream to a buffer
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Determines if a file should be encoded as base64 based on its MIME type
 * @param {string} mimeType
 * @returns {boolean}
 */
function isBinaryFile(mimeType) {
  if (!mimeType) {
    return false;
  }

  // Binary file types that need base64 encoding
  const binaryTypes = ['application/', 'image/', 'audio/', 'video/', 'font/'];

  // Text types that can use utf8
  const textTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
  ];

  // Check if it's explicitly a text type
  if (textTypes.some((type) => mimeType.startsWith(type))) {
    return false;
  }

  // Check if it's a binary type
  if (binaryTypes.some((type) => mimeType.startsWith(type))) {
    return true;
  }

  // Default to text for unknown types
  return false;
}

/**
 * Fetches files from LibreChat storage and encodes them for Piston API.
 * Reuses existing file infrastructure (DB + S3/Firebase/local storage).
 * 
 * @param {Object} req - Server request object
 * @param {Array} files - Array of file objects from primeFiles: { id: file_id, name: filename }
 * @returns {Promise<Array>} Array of files formatted for Piston API
 */
async function prepareFilesForPiston(req, files) {
  const pistonFiles = [];

  if (!files || files.length === 0) {
    return pistonFiles;
  }

  // Extract file IDs - primeFiles returns { id, name } structure
  const fileIds = files.map((f) => f.id).filter(Boolean);

  // Fetch from LibreChat DB
  const dbFiles = await getFiles({ file_id: { $in: fileIds } }, null, { text: 0 });

  if (!dbFiles || dbFiles.length === 0) {
    return pistonFiles;
  }

  for (const dbFile of dbFiles) {
    try {
      // Get download stream using existing strategy (S3/Firebase/local)
      const { getDownloadStream } = getStrategyFunctions(dbFile.source);
      const stream = await getDownloadStream(req, dbFile.filepath);
      const buffer = await streamToBuffer(stream);

      // Determine encoding based on file type
      const isBinary = isBinaryFile(dbFile.type);

      // Format for Piston API
      pistonFiles.push({
        name: dbFile.filename,
        content: buffer.toString(isBinary ? 'base64' : 'utf8'),
        encoding: isBinary ? 'base64' : 'utf8',
      });
    } catch (error) {
      logger.error(`[Piston] Error preparing file ${dbFile.filename}:`, error);
      // Continue with other files
    }
  }

  return pistonFiles;
}

module.exports = {
  prepareFilesForPiston,
  isBinaryFile,
  streamToBuffer,
};

