const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { getCodeBaseURL } = require('@librechat/agents');
const {
  logAxiosError,
  createAxiosInstance,
  codeServerHttpAgent,
  codeServerHttpsAgent,
  getCodeApiAuthHeaders,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { FileSources, mergeCodeEnvRef } = require('librechat-data-provider');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getStrategyFunctions } = require('./strategies');

// TODO: check and potentially fix — concurrent temp file collision (deterministic path based on file_id)
// TODO: check and potentially fix — direct mutation of shared file objects in provisionFiles callback
// TODO: check and potentially fix — this file should be TypeScript in packages/api per CLAUDE.md rules

/* Created on first use rather than at module load: this module is pulled into the
 * OpenAI-compatible controllers, whose tests partially mock @librechat/api, and a
 * load-time call would throw before any provisioning is even requested. */
let axiosInstance;
const getAxios = () => (axiosInstance ??= createAxiosInstance());

/* Sources whose `getDownloadStream` takes `(req, filepath)` and returns a readable.
 * Others diverge: `openai` takes `(file_id, client)` and `execute_code` takes
 * `(fileIdentifier, identity, req)` returning an Axios response, so calling them
 * through this contract fails. An allowlist keeps an unfamiliar source skipped
 * rather than mis-invoked. */
const STORAGE_STREAM_SOURCES = new Set([
  FileSources.local,
  FileSources.s3,
  FileSources.cloudfront,
  FileSources.azure_blob,
  FileSources.firebase,
]);

/** Resolves a storage download stream, or null when the source uses a different contract. */
async function getStorageStream(file, req) {
  if (!STORAGE_STREAM_SOURCES.has(file.source)) {
    logger.warn(
      `[provision] Cannot stream "${file.filename}" (${file.file_id}) from source "${file.source}": unsupported download contract`,
    );
    return null;
  }
  const { getDownloadStream } = getStrategyFunctions(file.source);
  if (!getDownloadStream) {
    return null;
  }
  return await getDownloadStream(req, file.filepath);
}

/** Composes code-API auth: legacy X-API-Key when configured, plus JWT bearer when enabled. */
async function buildCodeApiHeaders({ apiKey, req }) {
  return {
    'User-Agent': 'LibreChat/1.0',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    ...(await getCodeApiAuthHeaders(req)),
  };
}

/** Image uploads are converted to appConfig.imageOutputType while the record keeps
 *  the original filename; rename so sandbox decoders match the stored bytes. */
function provisionFilename(file) {
  if (!file.type?.startsWith('image/')) {
    return file.filename;
  }
  const subtype = file.type.slice('image/'.length);
  if (!['webp', 'png', 'jpeg', 'gif'].includes(subtype)) {
    return file.filename;
  }
  const accepted = subtype === 'jpeg' ? ['.jpg', '.jpeg'] : [`.${subtype}`];
  const currentExt = path.extname(file.filename).toLowerCase();
  if (accepted.includes(currentExt)) {
    return file.filename;
  }
  return `${path.basename(file.filename, path.extname(file.filename))}${accepted[0]}`;
}

/** Env var holding the code-execution API key (symmetric with LIBRECHAT_CODE_BASEURL). */
const CODE_API_KEY_FIELD = 'LIBRECHAT_CODE_API_KEY';

/**
 * Loads the code-execution API key for a user. Call once per request and pass the
 * result to checkSessionsAlive to avoid redundant lookups. Returns undefined when
 * no key is configured; JWT-mode code auth can still authorize provisioning.
 *
 * @param {string} userId
 * @returns {Promise<string | undefined>} The code-execution API key, if configured
 */
async function loadCodeApiKey(userId) {
  const result = await loadAuthValues({
    userId,
    authFields: [CODE_API_KEY_FIELD],
    throwError: false,
  });
  return result[CODE_API_KEY_FIELD];
}

/**
 * Provisions a file to the code execution environment.
 * Gets a read stream from our storage and uploads to the code env, persisting
 * the resulting `codeEnvRef` so downstream readers (primeFiles, code env
 * categorization) can locate the sandbox copy on subsequent turns.
 *
 * @param {object} params
 * @param {object} params.req - Express request object (needs req.user.id)
 * @param {import('librechat-data-provider').TFile} params.file - The file record from DB
 * @param {string} [params.entity_id] - Optional entity ID (agent_id); when present the ref
 *   is scoped to `kind: 'agent'`, otherwise it falls back to `kind: 'user'`.
 * @returns {Promise<{ referenceSet: { codeEnvRef: object, codeEnvRefs: object }, fileUpdate: object }>}
 *   Merged pointers plus the deferred DB update
 */
async function provisionToCodeEnv({ req, file, entity_id }) {
  const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(FileSources.execute_code);
  const stream = await getStorageStream(file, req);
  if (!stream) {
    throw new Error(
      `Cannot provision file "${file.filename}" to code env: storage source "${file.source}" does not support download streams`,
    );
  }

  const kind = entity_id ? 'agent' : 'user';
  const id = entity_id ?? req.user.id;

  const uploaded = await uploadCodeEnvFile({
    req,
    stream,
    filename: provisionFilename(file),
    kind,
    id,
  });

  /* Merge rather than overwrite: the eager upload path persists the same shape via
   * mergeCodeEnvRef, so both the legacy pointer and the route-keyed map stay in sync
   * and pointers for other Code API routes survive re-provisioning. */
  const referenceSet = mergeCodeEnvRef(file.metadata, {
    kind,
    id,
    storage_session_id: uploaded.storage_session_id,
    file_id: uploaded.file_id,
    executionProfile: 'default',
    provisionedAt: Date.now(),
  });

  logger.debug(
    `[provisionToCodeEnv] Provisioned file "${file.filename}" (${file.file_id}) to code env`,
  );

  return {
    referenceSet,
    fileUpdate: { file_id: file.file_id, metadata: { ...file.metadata, ...referenceSet } },
  };
}

/**
 * Provisions a file to the vector DB for file_search/RAG.
 * Gets the file from our storage and uploads vectors/embeddings.
 *
 * @param {object} params
 * @param {object} params.req - Express request object
 * @param {import('librechat-data-provider').TFile} params.file - The file record from DB
 * @param {string} [params.entity_id] - Optional entity ID (agent_id)
 * @param {import('stream').Readable} [params.existingStream] - Pre-fetched download stream (avoids duplicate storage fetch)
 * @returns {Promise<{ embedded: boolean, fileUpdate: object | null }>} Result with deferred DB update
 */
async function provisionToVectorDB({ req, file, entity_id, existingStream }) {
  if (!process.env.RAG_API_URL) {
    logger.warn('[provisionToVectorDB] RAG_API_URL not defined, skipping vector provisioning');
    return { embedded: false, fileUpdate: null };
  }

  /* Unique per attempt: two concurrent requests provisioning the same file_id would
   * otherwise share one path, and the first to finish unlinks it while the second is
   * still streaming into uploadVectors. */
  const tmpPath = path.join(
    os.tmpdir(),
    `provision-${file.file_id}-${randomUUID()}${path.extname(file.filename)}`,
  );

  try {
    let stream = existingStream;
    if (!stream) {
      stream = await getStorageStream(file, req);
      if (!stream) {
        throw new Error(
          `Cannot provision file "${file.filename}" to vector DB: storage source "${file.source}" does not support download streams`,
        );
      }
    }

    // uploadVectors expects a file-like object with a `path` property for fs.createReadStream.
    // Since we're provisioning from storage (not a multer upload), we stream to a temp file first.
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

    logger.debug(
      `[provisionToVectorDB] Provisioned file "${file.filename}" (${file.file_id}) to vector DB, embedded=${embedded}`,
    );

    return {
      embedded,
      fileUpdate: embedded ? { file_id: file.file_id, embedded } : null,
    };
  } finally {
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
 * @param {import('librechat-data-provider').TFile} params.file - File with metadata.codeEnvRef
 * @param {string} [params.apiKey] - Legacy CODE_API_KEY, when configured
 * @param {object} [params.req] - Request used to mint JWT code auth, when enabled
 * @returns {Promise<boolean>} true if the file is still accessible in the code env
 */
async function checkCodeEnvFileAlive({ file, apiKey, req }) {
  const ref = file.metadata?.codeEnvRef;
  if (!ref?.storage_session_id || !ref?.file_id) {
    return false;
  }

  try {
    const baseURL = getCodeBaseURL();
    const response = await getAxios()({
      method: 'get',
      url: `${baseURL}/files/${ref.storage_session_id}`,
      params: { detail: 'summary' },
      headers: await buildCodeApiHeaders({ apiKey, req }),
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 5000,
    });

    const found = response.data?.some((f) => f.fileId === ref.file_id);
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
 * Batch-check code env file liveness by `storage_session_id`.
 * Groups files by session, makes one API call per session.
 *
 * @param {object} params
 * @param {import('librechat-data-provider').TFile[]} params.files - Files with metadata.codeEnvRef
 * @param {string} [params.apiKey] - Pre-loaded legacy CODE_API_KEY, when configured
 * @param {object} [params.req] - Request used to mint JWT code auth, when enabled
 * @param {number} [params.staleSafeWindowMs=21600000] - Skip the live check if the file was provisioned to the code env within this window (default 6h)
 * @returns {Promise<Set<string>>} file_ids that are not known to be expired: confirmed
 *   alive, within the safe window, or unverifiable because the probe itself failed
 */
async function checkSessionsAlive({ files, apiKey, req, staleSafeWindowMs = 6 * 60 * 60 * 1000 }) {
  const aliveFileIds = new Set();
  const now = Date.now();

  // Group files by storage_session_id, skip recently-updated files (fast pre-filter)
  /** @type {Map<string, Array<{ file_id: string; remoteFileId: string }>>} */
  const sessionGroups = new Map();

  for (const file of files) {
    const ref = file.metadata?.codeEnvRef;
    if (!ref?.storage_session_id || !ref?.file_id) {
      continue;
    }

    // Trust only the code-env upload timestamp, not `updatedAt` (bumped by usage,
    // e.g. updateFilesUsage on resend); a usage-touched file may still have an
    // expired sandbox session. Refs without a marker fall through to a live check.
    const provisionedAt = ref.provisionedAt ?? 0;
    if (provisionedAt && now - provisionedAt < staleSafeWindowMs) {
      aliveFileIds.add(file.file_id);
      continue;
    }

    if (!sessionGroups.has(ref.storage_session_id)) {
      sessionGroups.set(ref.storage_session_id, []);
    }
    sessionGroups.get(ref.storage_session_id).push({
      file_id: file.file_id,
      remoteFileId: ref.file_id,
    });
  }

  // One API call per session (in parallel)
  const baseURL = getCodeBaseURL();
  const headers = await buildCodeApiHeaders({ apiKey, req });
  const sessionChecks = Array.from(sessionGroups.entries()).map(
    async ([session_id, fileEntries]) => {
      try {
        const response = await getAxios()({
          method: 'get',
          url: `${baseURL}/files/${session_id}`,
          params: { detail: 'summary' },
          headers,
          httpAgent: codeServerHttpAgent,
          httpsAgent: codeServerHttpsAgent,
          timeout: 5000,
        });

        const remoteFiles = response.data ?? [];
        for (const { file_id, remoteFileId } of fileEntries) {
          if (remoteFiles.some((f) => f.fileId === remoteFileId)) {
            aliveFileIds.add(file_id);
          }
        }
      } catch (error) {
        logAxiosError({
          message: `[checkSessionsAlive] Error checking session "${session_id}": ${error.message}`,
          error,
        });
        /* A failed probe means unknown, not expired: a timeout or 5xx would otherwise
         * clear a live ref and force a re-upload that the same outage will likely fail
         * too, losing access to a working sandbox file. Only a successful response that
         * omits the file marks it expired. */
        for (const { file_id } of fileEntries) {
          aliveFileIds.add(file_id);
        }
      }
    },
  );

  await Promise.allSettled(sessionChecks);
  return aliveFileIds;
}

module.exports = {
  loadCodeApiKey,
  provisionToCodeEnv,
  provisionToVectorDB,
  checkCodeEnvFileAlive,
  checkSessionsAlive,
};
