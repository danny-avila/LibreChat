const { EModelEndpoint, isDocumentSupportedEndpoint } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { validateVideo } = require('@librechat/api');
const { streamToBuffer } = require('~/server/services/Files/Documents/encode');

/**
 * Encodes and formats video files for different endpoints
 * @param {Express.Request} req - The request object
 * @param {Array<MongoFile>} files - Array of video files
 * @param {EModelEndpoint} endpoint - The endpoint to format for
 * @returns {Promise<{ videos: Array, files: Array<MongoFile> }>}
 */
async function encodeAndFormatVideos(req, files, endpoint) {
  const promises = [];
  const encodingMethods = {};
  /** @type {{ videos: any[]; files: MongoFile[] }} */
  const result = {
    videos: [],
    files: [],
  };

  for (const file of files) {
    if (!file || !file.filepath) {
      continue;
    }

    const source = file.source ?? 'local';
    if (!encodingMethods[source]) {
      encodingMethods[source] = getStrategyFunctions(source);
    }

    const fileMetadata = {
      file_id: file.file_id || file._id,
      temp_file_id: file.temp_file_id,
      filepath: file.filepath,
      source: file.source,
      filename: file.filename,
      type: file.type,
    };

    promises.push([file, fileMetadata]);
  }

  const results = await Promise.allSettled(
    promises.map(async ([file, fileMetadata]) => {
      if (!file || !fileMetadata) {
        return { file: null, content: null, metadata: fileMetadata };
      }

      try {
        const source = file.source ?? 'local';
        const { getDownloadStream } = encodingMethods[source];

        const stream = await getDownloadStream(req, file.filepath);
        const buffer = await streamToBuffer(stream);
        const videoContent = buffer.toString('base64');

        return {
          file,
          content: videoContent,
          metadata: fileMetadata,
        };
      } catch (error) {
        console.error(`Error processing video ${file.filename}:`, error);
        return { file, content: null, metadata: fileMetadata };
      }
    }),
  );

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Video processing failed:', settledResult.reason);
      continue;
    }

    const { file, content, metadata } = settledResult.value;

    if (!content || !file) {
      if (metadata) {
        result.files.push(metadata);
      }
      continue;
    }

    if (file.type.startsWith('video/') && isDocumentSupportedEndpoint(endpoint)) {
      const videoBuffer = Buffer.from(content, 'base64');

      const validation = await validateVideo(videoBuffer, videoBuffer.length, endpoint);
      if (!validation.isValid) {
        throw new Error(`Video validation failed: ${validation.error}`);
      }

      if (endpoint === EModelEndpoint.google) {
        const videoPart = {
          type: 'video',
          mimeType: file.type,
          data: content,
        };
        result.videos.push(videoPart);
      }

      result.files.push(metadata);
    }
  }

  return result;
}

module.exports = {
  encodeAndFormatVideos,
};
