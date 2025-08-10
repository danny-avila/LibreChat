const { EModelEndpoint } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { validateAnthropicPdf } = require('../validation/pdfValidator');

/**
 * Converts a readable stream to a buffer.
 *
 * @param {NodeJS.ReadableStream} stream - The readable stream to convert.
 * @returns {Promise<Buffer>} - Promise resolving to the buffer.
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        chunks.length = 0; // Clear the array
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    });

    stream.on('error', (error) => {
      chunks.length = 0;
      reject(error);
    });
  }).finally(() => {
    // Clean up the stream if required
    if (stream.destroy && typeof stream.destroy === 'function') {
      stream.destroy();
    }
  });
}

/**
 * Processes and encodes document files for various endpoints
 *
 * @param {Express.Request} req - Express request object
 * @param {MongoFile[]} files - Array of file objects to process
 * @param {string} endpoint - The endpoint identifier (e.g., EModelEndpoint.anthropic)
 * @returns {Promise<{documents: MessageContentDocument[], files: MongoFile[]}>}
 */
async function encodeAndFormatDocuments(req, files, endpoint) {
  const promises = [];
  /** @type {Record<FileSources, Pick<ReturnType<typeof getStrategyFunctions>, 'prepareDocumentPayload' | 'getDownloadStream'>>} */
  const encodingMethods = {};
  /** @type {{ documents: MessageContentDocument[]; files: MongoFile[] }} */
  const result = {
    documents: [],
    files: [],
  };

  if (!files || !files.length) {
    return result;
  }

  // Filter for document files only
  const documentFiles = files.filter(
    (file) => file.type === 'application/pdf' || file.type?.startsWith('application/'), // Future: support for other document types
  );

  if (!documentFiles.length) {
    return result;
  }

  for (let file of documentFiles) {
    /** @type {FileSources} */
    const source = file.source ?? 'local';

    // Only process PDFs for Anthropic for now
    if (file.type !== 'application/pdf' || endpoint !== EModelEndpoint.anthropic) {
      continue;
    }

    if (!encodingMethods[source]) {
      encodingMethods[source] = getStrategyFunctions(source);
    }

    // Prepare file metadata
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
        const documentContent = buffer.toString('base64');

        return {
          file,
          content: documentContent,
          metadata: fileMetadata,
        };
      } catch (error) {
        console.error(`Error processing document ${file.filename}:`, error);
        return { file, content: null, metadata: fileMetadata };
      }
    }),
  );

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Document processing failed:', settledResult.reason);
      continue;
    }

    const { file, content, metadata } = settledResult.value;

    if (!content || !file) {
      if (metadata) {
        result.files.push(metadata);
      }
      continue;
    }

    if (file.type === 'application/pdf' && endpoint === EModelEndpoint.anthropic) {
      const pdfBuffer = Buffer.from(content, 'base64');
      const validation = await validateAnthropicPdf(pdfBuffer, pdfBuffer.length);

      if (!validation.isValid) {
        throw new Error(`PDF validation failed: ${validation.error}`);
      }

      const documentPart = {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: content,
        },
      };

      result.documents.push(documentPart);
      result.files.push(metadata);
    }
  }

  return result;
}

module.exports = {
  encodeAndFormatDocuments,
};
