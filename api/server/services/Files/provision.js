const fs = require('fs');
const { EnvVar } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getStrategyFunctions } = require('./strategies');
const { updateFile } = require('~/models');

/**
 * Provisions a file to the code execution environment.
 * Gets a read stream from our storage and uploads to the code env.
 *
 * @param {object} params
 * @param {object} params.req - Express request object (needs req.user.id)
 * @param {import('librechat-data-provider').TFile} params.file - The file record from DB
 * @param {string} [params.entity_id] - Optional entity ID (agent_id)
 * @returns {Promise<string>} The fileIdentifier from the code env
 */
async function provisionToCodeEnv({ req, file, entity_id = '' }) {
  const { getDownloadStream } = getStrategyFunctions(file.source);
  if (!getDownloadStream) {
    throw new Error(
      `Cannot provision file "${file.filename}" to code env: storage source "${file.source}" does not support download streams`,
    );
  }

  const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(FileSources.execute_code);
  const result = await loadAuthValues({ userId: req.user.id, authFields: [EnvVar.CODE_API_KEY] });
  const stream = await getDownloadStream(req, file.filepath);

  const fileIdentifier = await uploadCodeEnvFile({
    req,
    stream,
    filename: file.filename,
    apiKey: result[EnvVar.CODE_API_KEY],
    entity_id,
  });

  const updatedMetadata = {
    ...file.metadata,
    fileIdentifier,
  };

  await updateFile({
    file_id: file.file_id,
    metadata: updatedMetadata,
  });

  logger.debug(
    `[provisionToCodeEnv] Provisioned file "${file.filename}" (${file.file_id}) to code env`,
  );

  return fileIdentifier;
}

/**
 * Provisions a file to the vector DB for file_search/RAG.
 * Gets the file from our storage and uploads vectors/embeddings.
 *
 * @param {object} params
 * @param {object} params.req - Express request object
 * @param {import('librechat-data-provider').TFile} params.file - The file record from DB
 * @param {string} [params.entity_id] - Optional entity ID (agent_id)
 * @returns {Promise<{ embedded: boolean }>} Embedding result
 */
async function provisionToVectorDB({ req, file, entity_id }) {
  if (!process.env.RAG_API_URL) {
    logger.warn('[provisionToVectorDB] RAG_API_URL not defined, skipping vector provisioning');
    return { embedded: false };
  }

  const { getDownloadStream } = getStrategyFunctions(file.source);
  if (!getDownloadStream) {
    throw new Error(
      `Cannot provision file "${file.filename}" to vector DB: storage source "${file.source}" does not support download streams`,
    );
  }

  // The uploadVectors function expects a file-like object with a `path` property for fs.createReadStream.
  // Since we're provisioning from storage (not a multer upload), we need to stream to a temp file first.
  const os = require('os');
  const path = require('path');
  const tmpPath = path.join(os.tmpdir(), `provision-${file.file_id}-${file.filename}`);

  try {
    const stream = await getDownloadStream(req, file.filepath);
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(tmpPath);
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      stream.on('error', reject);
    });

    const { uploadVectors } = require('./VectorDB/crud');
    const tempFile = {
      path: tmpPath,
      originalname: file.filename,
      mimetype: file.type,
      size: file.bytes,
    };

    const embeddingResult = await uploadVectors({
      req,
      file: tempFile,
      file_id: file.file_id,
      entity_id,
    });

    const embedded = embeddingResult?.embedded ?? false;

    await updateFile({
      file_id: file.file_id,
      embedded,
    });

    logger.debug(
      `[provisionToVectorDB] Provisioned file "${file.filename}" (${file.file_id}) to vector DB, embedded=${embedded}`,
    );

    return { embedded };
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

module.exports = {
  provisionToCodeEnv,
  provisionToVectorDB,
};
