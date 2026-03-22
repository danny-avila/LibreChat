const fs = require('fs');
const path = require('path');
const os = require('os');
const { EnvVar, getCodeBaseURL } = require('@librechat/agents');
const {
  logAxiosError,
  createAxiosInstance,
  codeServerHttpAgent,
  codeServerHttpsAgent,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getStrategyFunctions } = require('./strategies');
const { updateFile } = require('~/models');

const axios = createAxiosInstance();

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
  const tmpPath = path.join(os.tmpdir(), `provision-${file.file_id}${path.extname(file.filename)}`);

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

/**
 * Check if a single code env file is still alive by querying its session.
 *
 * @param {object} params
 * @param {import('librechat-data-provider').TFile} params.file - File with metadata.fileIdentifier
 * @param {string} params.apiKey - CODE_API_KEY
 * @returns {Promise<boolean>} true if the file is still accessible in the code env
 */
async function checkCodeEnvFileAlive({ file, apiKey }) {
  if (!file.metadata?.fileIdentifier) {
    return false;
  }

  try {
    const baseURL = getCodeBaseURL();
    const [filePath, queryString] = file.metadata.fileIdentifier.split('?');
    const session_id = filePath.split('/')[0];

    let queryParams = {};
    if (queryString) {
      queryParams = Object.fromEntries(new URLSearchParams(queryString).entries());
    }

    const response = await axios({
      method: 'get',
      url: `${baseURL}/files/${session_id}`,
      params: { detail: 'summary', ...queryParams },
      headers: {
        'User-Agent': 'LibreChat/1.0',
        'X-API-Key': apiKey,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 5000,
    });

    const found = response.data?.some((f) => f.name?.startsWith(filePath));
    return !!found;
  } catch (error) {
    logAxiosError({
      message: `[checkCodeEnvFileAlive] Error checking file "${file.filename}": ${error.message}`,
      error,
    });
    return false;
  }
}

/**
 * Batch-check code env file liveness by session_id.
 * Groups files by session, makes one API call per session.
 *
 * @param {object} params
 * @param {import('librechat-data-provider').TFile[]} params.files - Files with metadata.fileIdentifier
 * @param {string} params.userId - User ID for loading CODE_API_KEY
 * @param {number} [params.staleSafeWindowMs=21600000] - Skip check if file updated within this window (default 6h)
 * @returns {Promise<Set<string>>} Set of file_ids that are confirmed alive
 */
async function checkSessionsAlive({ files, userId, staleSafeWindowMs = 6 * 60 * 60 * 1000 }) {
  const result = await loadAuthValues({ userId, authFields: [EnvVar.CODE_API_KEY] });
  const apiKey = result[EnvVar.CODE_API_KEY];
  const aliveFileIds = new Set();
  const now = Date.now();

  // Group files by session_id, skip recently-updated files (fast pre-filter)
  /** @type {Map<string, Array<{ file_id: string; filePath: string }>>} */
  const sessionGroups = new Map();

  for (const file of files) {
    if (!file.metadata?.fileIdentifier) {
      continue;
    }

    const updatedAt = file.updatedAt ? new Date(file.updatedAt).getTime() : 0;
    if (now - updatedAt < staleSafeWindowMs) {
      aliveFileIds.add(file.file_id);
      continue;
    }

    const [filePath] = file.metadata.fileIdentifier.split('?');
    const session_id = filePath.split('/')[0];

    if (!sessionGroups.has(session_id)) {
      sessionGroups.set(session_id, []);
    }
    sessionGroups.get(session_id).push({ file_id: file.file_id, filePath });
  }

  // One API call per session (in parallel)
  const baseURL = getCodeBaseURL();
  const sessionChecks = Array.from(sessionGroups.entries()).map(
    async ([session_id, fileEntries]) => {
      try {
        const response = await axios({
          method: 'get',
          url: `${baseURL}/files/${session_id}`,
          params: { detail: 'summary' },
          headers: {
            'User-Agent': 'LibreChat/1.0',
            'X-API-Key': apiKey,
          },
          httpAgent: codeServerHttpAgent,
          httpsAgent: codeServerHttpsAgent,
          timeout: 5000,
        });

        const remoteFiles = response.data ?? [];
        for (const { file_id, filePath } of fileEntries) {
          if (remoteFiles.some((f) => f.name?.startsWith(filePath))) {
            aliveFileIds.add(file_id);
          }
        }
      } catch (error) {
        logAxiosError({
          message: `[checkSessionsAlive] Error checking session "${session_id}": ${error.message}`,
          error,
        });
        // All files in this session treated as expired
      }
    },
  );

  await Promise.allSettled(sessionChecks);
  return aliveFileIds;
}

module.exports = {
  provisionToCodeEnv,
  provisionToVectorDB,
  checkCodeEnvFileAlive,
  checkSessionsAlive,
};
