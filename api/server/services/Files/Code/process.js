const path = require('path');
const mongoose = require('mongoose');
const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { getCodeBaseURL } = require('@librechat/agents');
const {
  withTimeout,
  getBasePath,
  logAxiosError,
  hasOfficeHtmlPath,
  sanitizeArtifactPath,
  flattenArtifactPath,
  createAxiosInstance,
  getCodeApiAuthHeaders,
  withCodeApiRateLimit,
  classifyCodeArtifact,
  isMissingSandboxPathError,
  parseSandboxImageChunk,
  readWindowedSandboxImage,
  createCodeApiRateLimitBudget,
  codeServerHttpAgent,
  codeServerHttpsAgent,
  extractCodeArtifactText,
  extractCodeArtifactRawText,
  extractCodeArtifactInspectionText,
  getBoundedCodeOutputByteLimit,
  getExtractedTextFormat,
  getStorageMetadata,
  getCodeExecutionBaseUrl,
  buildCodeEnvDownloadQuery,
  codeExecutionHeaders,
  executeWorkspaceTool,
  claimCodeDestination,
  createCodeDestinationSet,
  CODE_OUTPUT_PREFLIGHT_MAX_BYTES,
  CODE_OUTPUT_PREFLIGHT_MAX_COUNT,
  sortCodeFilesByDestinationPriority,
} = require('@librechat/api');
const {
  Tools,
  megabyte,
  fileConfig,
  FileContext,
  FileSources,
  imageExtRegex,
  inferMimeType,
  EToolResources,
  EModelEndpoint,
  ErrorTypes,
  mergeFileConfig,
  getCodeEnvRefs,
  mergeCodeEnvRef,
  getCodeEnvRefForProfile,
  getEndpointFileConfig,
} = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { createFile, getFiles, updateFile, claimCodeFile } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { getRetentionExpiry } = require('~/server/services/Files/retention');
const { determineFileType } = require('~/server/utils');

const axios = createAxiosInstance();

/** Request-scoped references to buffers already fetched by artifact preflight.
 * The request object is the ownership boundary, and WeakMap keeps completed
 * requests from retaining generated-file bytes. */
const preparedCodeOutputBuffers = new WeakMap();

const codeOutputBufferKey = (routeKey, sessionId, fileId) => `${routeKey}\0${sessionId}\0${fileId}`;

const getCodeOutputRouteKey = ({ executionRouteKey, codeApiBaseUrl, executionProfile }) =>
  executionRouteKey ?? codeApiBaseUrl ?? executionProfile ?? 'default';

const normalizeSandboxArtifactName = (filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }
  if (filePath.includes('\\')) {
    return null;
  }
  const posixPath = filePath;
  let relativePath = posixPath;
  if (posixPath.startsWith('/mnt/data/')) {
    relativePath = posixPath.slice('/mnt/data/'.length);
  } else if (posixPath.startsWith('/')) {
    return null;
  }
  if (relativePath.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  const normalized = path.posix.normalize(relativePath).replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    return null;
  }
  return normalized;
};

const cachePreparedCodeOutputBuffer = ({
  req,
  id,
  name,
  session_id,
  buffer,
  codeApiBaseUrl,
  executionProfile,
  executionRouteKey,
}) => {
  if (
    !req ||
    (typeof req !== 'object' && typeof req !== 'function') ||
    typeof id !== 'string' ||
    typeof session_id !== 'string' ||
    !Buffer.isBuffer(buffer)
  ) {
    return;
  }
  let cache = preparedCodeOutputBuffers.get(req);
  if (!cache) {
    cache = { buffers: new Map(), totalBytes: 0 };
    preparedCodeOutputBuffers.set(req, cache);
  }
  const routeKey = getCodeOutputRouteKey({ executionRouteKey, codeApiBaseUrl, executionProfile });
  const key = codeOutputBufferKey(routeKey, session_id, id);
  const existing = cache.buffers.get(key);
  if (existing) {
    cache.totalBytes -= existing.buffer.length;
    cache.buffers.delete(key);
  }
  if (buffer.length > CODE_OUTPUT_PREFLIGHT_MAX_BYTES) {
    return;
  }
  while (
    cache.buffers.size >= CODE_OUTPUT_PREFLIGHT_MAX_COUNT ||
    cache.totalBytes + buffer.length > CODE_OUTPUT_PREFLIGHT_MAX_BYTES
  ) {
    const oldestKey = cache.buffers.keys().next().value;
    if (oldestKey == null) {
      break;
    }
    const oldest = cache.buffers.get(oldestKey);
    cache.buffers.delete(oldestKey);
    cache.totalBytes -= oldest.buffer.length;
  }
  cache.buffers.set(key, { name, buffer });
  cache.totalBytes += buffer.length;
};

const getPreparedCodeOutputBuffer = ({
  req,
  file_path,
  session_id,
  files,
  codeApiBaseUrl,
  executionProfile,
  executionRouteKey,
}) => {
  if (!req || (typeof req !== 'object' && typeof req !== 'function') || !Array.isArray(files)) {
    return null;
  }
  const cache = preparedCodeOutputBuffers.get(req);
  const requestedName = normalizeSandboxArtifactName(file_path);
  if (!cache || !requestedName) {
    return null;
  }

  const routeKey = getCodeOutputRouteKey({ executionRouteKey, codeApiBaseUrl, executionProfile });
  for (const file of files) {
    if (!file || typeof file.id !== 'string' || typeof file.name !== 'string') {
      continue;
    }
    if (normalizeSandboxArtifactName(file.name) !== requestedName) {
      continue;
    }
    const storageSessionId = file.storage_session_id ?? file.session_id ?? session_id;
    if (typeof storageSessionId !== 'string') {
      continue;
    }
    const key = codeOutputBufferKey(routeKey, storageSessionId, file.id);
    const cached = cache.buffers.get(key);
    if (cached && normalizeSandboxArtifactName(cached.name) === requestedName) {
      cache.buffers.delete(key);
      cache.totalBytes -= cached.buffer.length;
      return cached.buffer;
    }
  }
  return null;
};

class CodeOutputDownloadLimitError extends Error {
  constructor(maxBytes) {
    super(`Generated file exceeds the ${maxBytes}-byte transport limit`);
    this.name = 'CodeOutputDownloadLimitError';
    this.code = 'CODE_OUTPUT_DOWNLOAD_LIMIT';
  }
}

const getCodeOutputFileSettings = (req) => {
  const mergedFileConfig = mergeFileConfig(req.config.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  const configuredFileSizeLimit =
    endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit;
  return {
    endpointFileConfig,
    fileSizeLimit: getBoundedCodeOutputByteLimit(configuredFileSizeLimit),
  };
};

const downloadCodeOutputBuffer = async ({
  req,
  id,
  session_id,
  maxBytes,
  codeApiBaseUrl,
  executionProfile = 'default',
  bridgeWorkerId,
}) => {
  const baseURL = codeApiBaseUrl ?? getCodeExecutionBaseUrl(executionProfile);
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  const downloadQuery = buildCodeEnvDownloadQuery({ kind: 'user', id: req.user.id });
  let response;
  try {
    response = await axios({
      method: 'get',
      url: `${baseURL}/download/${session_id}/${id}${downloadQuery}`,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
        ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
      ...(Number.isFinite(maxBytes) && maxBytes >= 0
        ? {
            maxContentLength: maxBytes,
            maxBodyLength: maxBytes,
          }
        : {}),
    });
  } catch (error) {
    if (
      Number.isFinite(maxBytes) &&
      maxBytes >= 0 &&
      /maxContentLength|maxBodyLength/i.test(error?.message ?? '')
    ) {
      throw new CodeOutputDownloadLimitError(maxBytes);
    }
    throw error;
  }
  const buffer = Buffer.from(response.data, 'binary');
  if (Number.isFinite(maxBytes) && maxBytes >= 0 && buffer.length > maxBytes) {
    throw new CodeOutputDownloadLimitError(maxBytes);
  }
  return buffer;
};

/**
 * Downloads and derives inspectable text for a code artifact without writing
 * file bytes or metadata. Direct tool calls use this to preflight every
 * artifact before allowing any one artifact to persist.
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {string} params.id
 * @param {string} params.name
 * @param {string} params.session_id
 * @param {number} [params.maxBytes] - Remaining aggregate inspection budget.
 * @param {string} [params.codeApiBaseUrl] - Trusted per-agent Code API endpoint.
 * @param {'default'|'stateful'} [params.executionProfile] - Trusted execution profile.
 * @param {string} [params.bridgeWorkerId] - Trusted worker selected for this execution.
 * @param {string} [params.executionRouteKey] - Trusted deployment-local route identity.
 */
const prepareCodeOutputForInspection = async ({
  req,
  id,
  name,
  session_id,
  maxBytes,
  inspectContent = true,
  codeApiBaseUrl,
  executionProfile = 'default',
  bridgeWorkerId,
  executionRouteKey,
}) => {
  const { fileSizeLimit } = getCodeOutputFileSettings(req);
  const transportLimit =
    Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.min(maxBytes, fileSizeLimit) : fileSizeLimit;
  const buffer = await downloadCodeOutputBuffer({
    req,
    id,
    session_id,
    maxBytes: transportLimit,
    codeApiBaseUrl,
    executionProfile,
    bridgeWorkerId,
  });
  cachePreparedCodeOutputBuffer({
    req,
    id,
    name,
    session_id,
    buffer,
    codeApiBaseUrl,
    executionProfile,
    executionRouteKey,
  });
  const safeName = sanitizeArtifactPath(name);
  const fallbackType = inferMimeType(name, '') || 'application/octet-stream';
  if (!inspectContent) {
    return {
      buffer,
      file: {
        name,
        filename: safeName,
        type: fallbackType,
      },
    };
  }
  if (buffer.length > fileSizeLimit) {
    return {
      buffer,
      extractedTextComplete: false,
      file: {
        name,
        filename: safeName,
        type: fallbackType,
      },
    };
  }

  const detectedType = await determineFileType(buffer, true);
  const detectedMimeType = detectedType?.mime?.toLowerCase();
  if (detectedMimeType?.startsWith('image/')) {
    return {
      buffer,
      extractedTextComplete: false,
      file: {
        name,
        filename: safeName,
        type: detectedMimeType,
      },
    };
  }

  const leafName = path.basename(safeName);
  const unknownText = detectedType == null ? extractCodeArtifactRawText(buffer, 'utf8-text') : null;
  const mimeType = unknownText != null ? 'text/plain' : (detectedMimeType ?? fallbackType);
  const category = unknownText != null ? 'utf8-text' : classifyCodeArtifact(leafName, mimeType);
  const content = unknownText ?? extractCodeArtifactRawText(buffer, category);
  const extractedText = await extractCodeArtifactInspectionText(
    buffer,
    leafName,
    mimeType,
    category,
  );
  return {
    buffer,
    extractedTextComplete: extractedText.complete,
    file: {
      name,
      filename: safeName,
      type: mimeType,
      content: content ?? undefined,
      extractedText: extractedText.text ?? undefined,
    },
  };
};

/**
 * Creates a fallback download URL response when file cannot be processed locally.
 * Used when: file exceeds size limit, storage strategy unavailable, or download error occurs.
 * @param {Object} params - The parameters.
 * @param {string} params.name - The filename.
 * @param {string} params.session_id - The code execution session ID.
 * @param {string} params.id - The file ID from the code environment.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.toolCallId - The tool call ID that generated the file.
 * @param {string} params.messageId - The current message ID.
 * @param {number} params.expiresAt - Expiration timestamp (24 hours from creation).
 * @param {'default'|'stateful'} [params.executionProfile] - Code API route for later fallback download.
 * @param {string} [params.executionRouteKey] - Deployment-local route identity.
 * @returns {Object} Fallback response with download URL.
 */
const createDownloadFallback = ({
  id,
  name,
  agentId,
  messageId,
  expiresAt,
  session_id,
  toolCallId,
  conversationId,
  executionProfile,
  executionRouteKey,
}) => {
  const basePath = getBasePath();
  const query = new URLSearchParams();
  if (executionProfile === 'stateful') {
    query.set('execution_profile', 'stateful');
  }
  if (executionRouteKey && executionRouteKey !== executionProfile) {
    query.set('execution_route_key', executionRouteKey);
  }
  const routeQuery = query.size > 0 ? `?${query.toString()}` : '';
  return {
    filename: name,
    filepath: `${basePath}/api/files/code/download/${session_id}/${id}${routeQuery}`,
    expiresAt,
    conversationId,
    toolCallId,
    messageId,
    agentId,
  };
};

/**
 * Hard ceiling on the deferred preview rendering (HTML extraction + DB
 * update). The inner office-render path already has its own 12s timeout
 * and a concurrency-limited queue; this is the outer guard that catches
 * pathological cases where queue wait + render + DB write would
 * otherwise hang the file in `status: 'pending'` indefinitely.
 *
 * If the timeout fires the record is updated to `status: 'failed'`
 * with `previewError: 'timeout'` and the UI shows download-only.
 */
const PREVIEW_FINALIZE_TIMEOUT_MS = 60_000;

/**
 * Mirror the terminal deferred-preview status onto every message
 * attachment referencing this `file_id`, so a re-opened conversation
 * never keeps the stale `status: 'pending'` that the immediate-persist
 * step wrote on the message attachment descriptor. The background render
 * only ever updated the `files` record; without this mirror the message
 * attachment stays `pending` forever, leaving the conversation page to
 * re-poll `GET /api/files/:id/preview` on every load.
 *
 * Fire-and-forget and failure-tolerant: any error is logged and
 * swallowed — it must never affect the `finalizePreview` return value
 * or the render pipeline. The match is purely by `file_id`, so one
 * render repairs all sibling attachments that reference the same
 * claimed file (multiple tool calls / handoff agents can legitimately
 * share a single code-output file).
 */
const syncMessageAttachment = async ({ file_id, status, text, textFormat, previewError }) => {
  try {
    const result = await mongoose.connection.collection('messages').updateMany(
      { 'attachments.file_id': file_id },
      {
        $set: {
          'attachments.$[a].status': status,
          'attachments.$[a].text': text ?? null,
          'attachments.$[a].textFormat': textFormat ?? null,
          'attachments.$[a].previewError': previewError ?? null,
        },
      },
      { arrayFilters: [{ 'a.file_id': file_id }] },
    );
    if (result?.modifiedCount) {
      logger.debug(
        `[syncMessageAttachment] ${file_id}: mirrored ${result.modifiedCount} message attachment(s) -> ${status}`,
      );
    }
  } catch (error) {
    logger.error(
      `[syncMessageAttachment] ${file_id}: failed to mirror status onto message attachment: ${
        error?.message ?? error
      }`,
    );
  }
};

/**
 * Render the inline HTML preview for a code-execution file (or plain
 * text for non-office buckets that still benefit from caching), then
 * atomically transition the DB record to `status: 'ready'` (with
 * `text`/`textFormat`) or `status: 'failed'` (with `previewError`).
 *
 * Decoupled from `processCodeOutput` so the agent's final response is
 * not blocked on potentially slow office rendering. The caller fires
 * this without awaiting; promises continue running after the HTTP
 * response closes (Node doesn't kill them) and the frontend learns of
 * completion via the `attachment` update SSE event (if the stream is
 * still open) or via React Query polling otherwise. Process restart
 * is the only thing that can lose progress — covered by the boot-time
 * orphan sweep.
 *
 * @param {object} params
 * @param {Buffer} params.buffer - The full downloaded file contents,
 *   bounded by the server's `fileSizeLimit` config (defaults far above
 *   the 1MB extractor cap). The buffer is captured by the closure
 *   returned in `{ finalize }`, so when many office files queue behind
 *   the inner concurrency limiter (cap 2), all queued buffers stay
 *   resident until each one's slot frees. For a tool result emitting
 *   N office files, peak heap usage from this path is up to
 *   `N * fileSizeLimit`. Acceptable for typical agent runs (a handful
 *   of files at a few hundred KB each); pathological cases are bounded
 *   by the inner per-file 12s timeout and the outer 60s render cap.
 * @param {string} params.leafName - Basename for classification.
 * @param {string} params.mimeType - Detected/inferred MIME.
 * @param {string} params.category - Classifier output.
 * @param {string} params.file_id - The DB record key for the update.
 * @param {string} [params.previewRevision] - Generation marker stamped
 *   by the immediate persist step. The DB commit is conditional on
 *   this — if a newer emit (cross-turn filename reuse) has rotated
 *   the revision before this render finishes, `updateFile` returns
 *   null and the stale render is silently discarded rather than
 *   overwriting the newer record.
 * @returns {Promise<MongoFile | null>} The post-update record on
 *   success; `null` if the DB update itself failed (extraction failure
 *   is reflected as `status: 'failed'`, not a thrown error) or if the
 *   `previewRevision` guard rejected the write.
 */
const finalizePreview = async ({
  buffer,
  leafName,
  mimeType,
  category,
  file_id,
  previewRevision,
}) => {
  let text = null;
  let previewError;
  try {
    text = await withTimeout(
      extractCodeArtifactText(buffer, leafName, mimeType, category),
      PREVIEW_FINALIZE_TIMEOUT_MS,
      `Preview extraction exceeded ${PREVIEW_FINALIZE_TIMEOUT_MS}ms`,
    );
  } catch (_error) {
    /* `extractCodeArtifactText` swallows its own errors and returns null,
     * so the only way to reach here is a `withTimeout` rejection — i.e.
     * the queue + render combined exceeded the outer 60s ceiling. */
    previewError = 'timeout';
    logger.warn(
      `[finalizePreview] ${file_id}: extraction timed out after ${PREVIEW_FINALIZE_TIMEOUT_MS}ms`,
    );
  }
  /* HTML-or-null contract (PR #12934): null result on an office file
   * must NOT fall back to plain text — surface as failed. Caller gates
   * on `hasOfficeHtmlPath`, so reaching here always means office. */
  const textFormat = getExtractedTextFormat(leafName, mimeType, text);
  const failed = text == null;
  const status = failed ? 'failed' : 'ready';
  if (failed && !previewError) {
    previewError = 'parser-error';
  }
  try {
    /* Conditional update: commit only if `previewRevision` still
     * matches what the immediate persist step stamped. If a newer
     * emit has rotated the revision (cross-turn filename reuse),
     * `updateFile` returns null and the stale render is silently
     * discarded. (Codex P1 review on PR #12957.) */
    const updated = await updateFile(
      {
        file_id,
        text,
        textFormat,
        status,
        previewError: failed ? previewError : null,
      },
      previewRevision ? { previewRevision } : undefined,
    );
    if (!updated && previewRevision) {
      logger.debug(
        `[finalizePreview] ${file_id}: stale render skipped — newer emit has superseded revision ${previewRevision}`,
      );
    }
    /* Mirror the resolved status onto the message attachment(s) so a
     * re-opened conversation never keeps `status: 'pending'` (see
     * `syncMessageAttachment`). Only on a committed update — a
     * revision-guard rejection means a newer emit superseded this one. */
    if (updated) {
      void syncMessageAttachment({
        file_id,
        status,
        text,
        textFormat,
        previewError: failed ? previewError : null,
      });
    }
    return updated;
  } catch (error) {
    logger.error(
      `[finalizePreview] ${file_id}: failed to persist preview result: ${error?.message ?? error}`,
    );
    return null;
  }
};

/**
 * Run the background `finalize` thunk returned by `processCodeOutput`
 * and route the resolved record to the caller's emit logic. Shared
 * between `callbacks.js` (chat-completions + Open Responses) and
 * `tools.js` (direct tool endpoint) so the fire-and-forget pattern
 * doesn't drift across callsites.
 *
 * `onResolved` receives the post-update DB record and is the only piece
 * that varies — chat-completions writes the legacy `attachment` SSE
 * event, Open Responses writes the spec-shaped `librechat:attachment`
 * event with a sequence number, and the direct tool endpoint has no
 * stream to write to (caller passes a no-op).
 *
 * The catch path is the safety net for unexpected programming errors
 * inside `finalizePreview` ONLY. The function is designed to never
 * throw (extraction and DB failures are translated to `status: 'failed'`
 * inside it), but a ref error or future regression would otherwise
 * leave the DB record stuck at `'pending'` until the boot-time orphan
 * sweep — potentially hours away on a stable server. We attempt a
 * best-effort `updateFile` to mark the record `'failed'` with
 * `previewError: 'unexpected'` so the UI stops polling and the
 * next-turn LLM context surfaces the failure.
 *
 * `onResolved` errors are deliberately isolated in their own try/catch.
 * Without that isolation, a transient transport-side failure (SSE write
 * race after the stream closed, an emitter listener throwing) would
 * propagate into the finalize catch and downgrade an *already-resolved*
 * record to `failed` with `previewError: 'unexpected'` — surfacing
 * "preview unavailable" in the UI even though extraction succeeded
 * and the file is on disk. The emit failure is logged but the DB
 * record stays at whatever `finalizePreview` wrote (typically
 * `'ready'`), so the polling layer / next page load still sees the
 * resolved preview.
 *
 * @param {object} params
 * @param {(() => Promise<object | null>) | undefined} params.finalize - The
 *   thunk returned by `processCodeOutput`. No-op when undefined.
 * @param {string | undefined} params.fileId - DB key for the failure
 *   marker; if absent the catch only logs.
 * @param {string | undefined} [params.previewRevision] - Generation
 *   marker stamped by the immediate persist step. The defensive
 *   `updateFile` in the catch is conditional on this — if a newer
 *   emit has rotated the revision, the stale failure marker is
 *   silently discarded so a programming error from an older render
 *   doesn't override a newer turn's record.
 * @param {(updated: object) => void} [params.onResolved] - Called once
 *   on success with the post-update record.
 */
const runPreviewFinalize = ({ finalize, fileId, previewRevision, onResolved }) => {
  if (typeof finalize !== 'function') {
    return;
  }
  finalize()
    .then((updated) => {
      if (!updated || !onResolved) {
        return;
      }
      /* Isolated try/catch — a throw inside `onResolved` (transport-side
       * SSE write race, emitter listener error) MUST NOT propagate to
       * the outer `.catch`, which would downgrade an already-resolved
       * record to `failed` with `previewError: 'unexpected'`.
       * Extraction succeeded at this point and `finalizePreview` has
       * already persisted the terminal status; the polling layer / next
       * page load will surface the resolved preview even if this turn's
       * SSE emit didn't land. */
      try {
        onResolved(updated);
      } catch (emitError) {
        logger.error(
          `[runPreviewFinalize] onResolved threw for ${fileId}; record stays at the finalized status:`,
          emitError,
        );
      }
    })
    .catch((error) => {
      logger.error('Error rendering deferred preview:', error);
      if (!fileId) {
        return;
      }
      updateFile(
        {
          file_id: fileId,
          status: 'failed',
          previewError: 'unexpected',
        },
        previewRevision ? { previewRevision } : undefined,
      ).catch((updateErr) => {
        logger.error(
          `[runPreviewFinalize] also failed to mark ${fileId} as failed after error:`,
          updateErr,
        );
      });
    });
};

/**
 * Process code execution output files — downloads and saves both images
 * and non-image files. All files are saved to local storage with
 * `codeEnvRef` metadata for code env re-upload.
 *
 * Returns a two-part shape so callers can ship the attachment to the
 * client immediately and run preview extraction in the background:
 *   - `file`: persisted metadata (file is on disk, downloadable, and
 *     has `status: 'pending'` if a preview is still being rendered).
 *   - `finalize` (optional): a thunk returning the deferred preview
 *     result promise. Present only when an inline HTML preview is
 *     expected (office buckets — DOCX/XLSX/XLS/ODS/CSV/PPTX). Caller
 *     decides whether to await or fire-and-forget.
 *
 * Existing fallback paths (size limit, missing storage strategy, error
 * catch) return `{ file }` with no `finalize` — there's nothing to
 * extract.
 *
 * @param {ServerRequest} params.req - The Express request object.
 * @param {string} params.id - The file ID from the code environment.
 * @param {string} params.name - The filename.
 * @param {string} params.toolCallId - The tool call ID that generated the file.
 * @param {string} params.session_id - The code execution session ID.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.messageId - The current message ID.
 * @param {string} [params.codeApiBaseUrl] - Trusted per-agent Code API endpoint.
 * @param {'default'|'stateful'} [params.executionProfile] - Trusted execution profile.
 * @param {string} [params.executionRouteKey] - Trusted deployment-local route identity.
 * @param {string} [params.bridgeWorkerId] - Trusted bridge worker selected for this execution.
 * @param {Buffer} [params.preparedBuffer] - Bytes downloaded during a
 *   no-write content inspection preflight.
 * @param {boolean} [params.downloadFallback] - Return the bounded download
 *   fallback without downloading the generated bytes again.
 * @returns {Promise<{ file: MongoFile & { messageId: string, toolCallId: string }, finalize?: () => Promise<MongoFile | null> }>}
 */
const processCodeOutput = async ({
  req,
  id,
  name,
  toolCallId,
  conversationId,
  messageId,
  session_id,
  agentId,
  freshClaimAfter,
  codeApiBaseUrl,
  executionProfile = 'default',
  executionRouteKey = executionProfile,
  bridgeWorkerId,
  preparedBuffer,
  downloadFallback,
}) => {
  const appConfig = req.config;
  const currentDate = new Date();
  const fileExt = path.extname(name).toLowerCase();
  const isImage = fileExt && imageExtRegex.test(name);

  const { endpointFileConfig, fileSizeLimit } = getCodeOutputFileSettings(req);

  try {
    const formattedDate = currentDate.toISOString();
    if (downloadFallback === true) {
      return {
        file: createDownloadFallback({
          id,
          name,
          agentId,
          messageId,
          toolCallId,
          session_id,
          conversationId,
          executionProfile,
          executionRouteKey,
          expiresAt: currentDate.getTime() + 86400000,
        }),
      };
    }
    const buffer =
      preparedBuffer ??
      (await downloadCodeOutputBuffer({
        req,
        id,
        session_id,
        maxBytes: fileSizeLimit,
        codeApiBaseUrl,
        executionProfile,
        bridgeWorkerId,
      }));

    // Enforce file size limit
    if (buffer.length > fileSizeLimit) {
      logger.warn(
        `[processCodeOutput] File "${name}" (${(buffer.length / megabyte).toFixed(2)} MB) exceeds size limit of ${(fileSizeLimit / megabyte).toFixed(2)} MB, falling back to download URL`,
      );
      return {
        file: createDownloadFallback({
          id,
          name,
          agentId,
          messageId,
          toolCallId,
          session_id,
          conversationId,
          executionProfile,
          executionRouteKey,
          expiresAt: currentDate.getTime() + 86400000,
        }),
      };
    }

    /* Code-output files belong to the user who ran the execution.
     * SessionKey on codeapi will be `<tenant>:user:<userId>` for these,
     * so cache and access stay user-private. */
    const codeEnvRef = {
      kind: 'user',
      id: req.user.id,
      storage_session_id: session_id,
      file_id: id,
      executionProfile,
      ...(executionRouteKey !== executionProfile ? { executionRouteKey } : {}),
    };

    /* `safeName` keeps the directory structure (`a/b/file.txt` -> `a/b/file.txt`)
     * so the next prime() can place the file at the same nested path in the
     * sandbox; flattening would re-create the bug where every nested artifact
     * collapsed into the root and read_file calls 404'd. The flat-form
     * storage key is composed below once `file_id` is known so we can cap
     * the total length at filesystem NAME_MAX. */
    const safeName = sanitizeArtifactPath(name);
    if (safeName !== name) {
      logger.warn(
        `[processCodeOutput] Filename sanitized: "${name}" -> "${safeName}" | conv=${conversationId}`,
      );
    }

    /**
     * Atomically claim a file_id for this (filename, conversationId, context) tuple.
     * Uses $setOnInsert so concurrent calls for the same filename converge on
     * a single record instead of creating duplicates (TOCTOU race fix).
     *
     * Claim by `safeName` (not raw `name`) so the claim and the eventual
     * `createFile` agree on the filename column — otherwise weird inputs
     * (e.g. `"proj name/file@v1.txt"`) would claim under the raw name and
     * then write under the sanitized one, leaving the claim row orphaned.
     */
    /**
     * Dispatch-order stamp persisted with every write AND every claim insert
     * (foreground writes dispatch ≈ now): the out-of-order guard below
     * compares WRITER dispatch order, not wall-clock write time — an older
     * task writing late must not make a newer task's harvest look stale, and
     * a freshly claimed row must carry its claimant's stamp before the
     * content write lands.
     */
    const sourceDispatchedAt = freshClaimAfter ?? Date.now();

    const newFileId = v4();
    const claimed = await claimCodeFile({
      filename: safeName,
      conversationId,
      file_id: newFileId,
      user: req.user.id,
      tenantId: req.user.tenantId,
      sourceDispatchedAt,
    });
    const file_id = claimed.file_id;
    const isUpdate = file_id !== newFileId;

    /**
     * Out-of-order guard for detached (background) harvests: when the claimed
     * row's last writer was dispatched AFTER this task (`freshClaimAfter` =
     * this task's dispatch time), a newer run owns this filename slot. The
     * `(filename, conversationId)` unique index means the stale bytes have
     * nowhere else to live, so skip this file rather than overwrite fresh
     * content — the harvest's stdout patch still lands, only the superseded
     * attachment is omitted. Falls back to `updatedAt` for rows written
     * before the stamp existed (the claim itself is timestamp-neutral).
     */
    const lastWriterDispatchedAt =
      claimed.metadata?.sourceDispatchedAt ??
      (claimed.updatedAt != null ? new Date(claimed.updatedAt).getTime() : null);
    if (isUpdate && freshClaimAfter != null && lastWriterDispatchedAt > freshClaimAfter) {
      logger.warn(
        `[processCodeOutput] Skipping stale background output "${safeName}" (${file_id}): a newer run owns this filename`,
      );
      return null;
    }

    if (isUpdate) {
      logger.debug(
        `[processCodeOutput] Updating existing file "${safeName}" (${file_id}) instead of creating duplicate`,
      );
    }

    /**
     * Background harvests commit through a CONDITIONAL write: the ownership
     * predicate (last writer's dispatch stamp not newer than ours) is part of
     * the update's filter, so check and write are one atomic operation — a
     * stale harvest's commit simply misses and its attachment is skipped.
     * The row always exists here (the claim inserted it), so the non-upsert
     * `updateFile` matches `createFile(data, true)` semantics ($set + TTL
     * unset). Bytes a loser may have already uploaded to the shared storage
     * key are a narrow residual that per-file locking would be needed to
     * close. Foreground writes keep the unconditional `createFile` path.
     */
    const commitCodeFile = async (fileData) => {
      if (freshClaimAfter == null) {
        await createFile(fileData, true);
        return true;
      }
      const committed = await updateFile(fileData, {
        $or: [
          { 'metadata.sourceDispatchedAt': { $exists: false } },
          { 'metadata.sourceDispatchedAt': { $lte: sourceDispatchedAt } },
        ],
      });
      if (!committed) {
        logger.warn(
          `[processCodeOutput] Skipping stale background output "${safeName}" (${file_id}): a newer run owns this filename`,
        );
        return false;
      }
      return true;
    };

    /**
     * Preserve the original `messageId` on update. Each `processCodeOutput`
     * call would otherwise overwrite it with the current run's run id, which
     * decouples the file from the assistant message that originally created
     * it. `getCodeGeneratedFiles` filters by `messageId IN <thread>`, so a
     * stale id (e.g. from a later regeneration / failed re-read attempt)
     * silently excludes the file from priming on subsequent turns.
     */
    const persistedMessageId = isUpdate ? (claimed.messageId ?? messageId) : messageId;
    /* A generated-output write replaces the file's bytes, so pointers to
     * earlier content in another profile must not survive as reusable refs. */
    const codeEnvReferenceSet = mergeCodeEnvRef(undefined, codeEnvRef);
    const codeEnvMetadata = {
      ...claimed.metadata,
      ...codeEnvReferenceSet,
      sourceDispatchedAt,
    };

    if (isImage) {
      const usage = isUpdate ? (claimed.usage ?? 0) + 1 : 1;
      const _file = await convertImage(req, buffer, 'high', `${file_id}${fileExt}`);
      const filepath = usage > 1 ? `${_file.filepath}?v=${Date.now()}` : _file.filepath;
      const storageMetadata = getStorageMetadata({
        filepath: _file.filepath,
        source: appConfig.fileStrategy,
        storageKey: _file.storageKey,
        storageRegion: _file.storageRegion,
      });
      const file = {
        ..._file,
        filepath,
        ...storageMetadata,
        file_id,
        messageId: persistedMessageId,
        usage,
        filename: safeName,
        conversationId,
        executionProfile,
        user: req.user.id,
        tenantId: req.user.tenantId,
        type: `image/${appConfig.imageOutputType}`,
        createdAt: isUpdate ? claimed.createdAt : formattedDate,
        updatedAt: formattedDate,
        source: appConfig.fileStrategy,
        context: FileContext.execute_code,
        metadata: codeEnvMetadata,
        ...(await getRetentionExpiry(req)),
      };
      if (!(await commitCodeFile(file))) {
        return null;
      }
      return { file: Object.assign(file, { messageId, toolCallId, agentId }) };
    }

    const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
    if (!saveBuffer) {
      logger.warn(
        `[processCodeOutput] saveBuffer not available for strategy ${appConfig.fileStrategy}, falling back to download URL`,
      );
      return {
        file: createDownloadFallback({
          id,
          name,
          agentId,
          messageId,
          toolCallId,
          session_id,
          conversationId,
          executionProfile,
          executionRouteKey,
          expiresAt: currentDate.getTime() + 86400000,
        }),
      };
    }

    const detectedType = await determineFileType(buffer, true);
    const mimeType = detectedType?.mime || inferMimeType(name, '') || 'application/octet-stream';

    /** Check MIME type support - for code-generated files, we're lenient but log unsupported types */
    const isSupportedMimeType = fileConfig.checkType(
      mimeType,
      endpointFileConfig.supportedMimeTypes,
    );
    if (!isSupportedMimeType) {
      logger.warn(
        `[processCodeOutput] File "${name}" has unsupported MIME type "${mimeType}", proceeding with storage but may not be usable as tool resource`,
      );
    }

    /* Compose the storage key here, after `file_id` is known, so the
     * `flattenArtifactPath` cap budget can be calculated against the
     * actual prefix length. The full key has to fit in one filesystem
     * path component (NAME_MAX = 255 on most filesystems); without this
     * cap, deeply-nested artifact paths whose individual segments were
     * within bounds can still produce a flat form that overflows once
     * `${file_id}__` is prepended, causing `ENAMETOOLONG` inside
     * saveBuffer and falling back to a download URL. The 255 figure is
     * the conservative cross-platform NAME_MAX (Linux ext4, NTFS, APFS).
     */
    const NAME_MAX = 255;
    const flatName = flattenArtifactPath(safeName, NAME_MAX - file_id.length - 2);
    const fileName = `${file_id}__${flatName}`;
    const filepath = await saveBuffer({
      userId: req.user.id,
      buffer,
      fileName,
      basePath: 'uploads',
      tenantId: req.user.tenantId,
    });
    const storageMetadata = getStorageMetadata({
      filepath,
      source: appConfig.fileStrategy,
    });

    /* `classifyCodeArtifact` and `extractCodeArtifactText` make
     * extension/bare-name decisions on the input string. With the
     * path-preserving sanitizer they can now receive a nested path like
     * `reports.v1/Makefile`, which the classifier's `extensionOf` reads
     * as `v1/Makefile` (the slice after the dot in the directory name)
     * and the bare-name branch rejects because it sees a `.` anywhere in
     * the string. Result: extensionless artifacts under dotted folders
     * (Makefile, Dockerfile, etc.) get misclassified as `other` and
     * skip text extraction. Pass the basename so classification matches
     * what it would have gotten with the old flat-name flow. */
    const leafName = path.basename(safeName);
    const category = classifyCodeArtifact(leafName, mimeType);

    /* Office-bucket files (DOCX/XLSX/XLS/ODS/CSV/PPTX) route through
     * `bufferToOfficeHtml` which is CPU-heavy. Persist the record now
     * with `status: 'pending'` and `text: null` so the agent's response
     * isn't blocked, then return a `finalize` thunk the caller can run
     * in the background. Non-office files have cheap or no extraction
     * — run it inline so the caller gets a fully-resolved record
     * without juggling a finalize step. */
    const expectsPreview = hasOfficeHtmlPath(leafName, mimeType);

    const baseFile = {
      file_id,
      filepath,
      ...storageMetadata,
      messageId: persistedMessageId,
      object: 'file',
      filename: safeName,
      type: mimeType,
      conversationId,
      user: req.user.id,
      tenantId: req.user.tenantId,
      bytes: buffer.length,
      updatedAt: formattedDate,
      metadata: codeEnvMetadata,
      source: appConfig.fileStrategy,
      context: FileContext.execute_code,
      usage: isUpdate ? (claimed.usage ?? 0) + 1 : 1,
      createdAt: isUpdate ? claimed.createdAt : formattedDate,
      ...(await getRetentionExpiry(req)),
    };

    if (expectsPreview) {
      /* Persist with `status: 'pending'` and explicit
       * `text: null` / `textFormat: null` so an update that previously
       * had cached text gets cleared. The deferred finalize transitions
       * to 'ready' (with text/textFormat) or 'failed' (with
       * previewError).
       *
       * `previewRevision` is a fresh UUID stamped on every emit. The
       * deferred finalize's `updateFile` is conditional on this — if
       * a newer turn (cross-turn filename reuse) has rotated the
       * revision before this render finishes, the stale render is
       * silently discarded rather than overwriting the newer record.
       * (Codex P1 review on PR #12957.) */
      const previewRevision = v4();
      const file = {
        ...baseFile,
        text: null,
        textFormat: null,
        status: 'pending',
        previewError: null,
        previewRevision,
      };
      if (!(await commitCodeFile(file))) {
        return null;
      }
      return {
        file: Object.assign(file, { messageId, toolCallId, agentId }),
        finalize: () =>
          finalizePreview({ buffer, leafName, mimeType, category, file_id, previewRevision }),
        previewRevision,
      };
    }

    /* Non-office path: extraction is cheap (utf8 decode, parseDocument
     * for PDF/ODT, or null for binaries). Run inline and return a
     * fully-resolved record — no `finalize` needed. */
    const text = await extractCodeArtifactText(buffer, leafName, mimeType, category);
    /* `textFormat` accompanies `text` so the client can gate
     * office-HTML-bucket routing on a trusted signal — clients MUST
     * NOT inject `text` into the iframe as HTML unless `textFormat ===
     * 'html'`. RAG-uploaded `.docx` etc. arrive with plain text from
     * mammoth.extractRawText and would otherwise be hijacked by the
     * extension-based office routing into the HTML-injection path
     * (Codex P1 review on PR #12934). null on extract failure — the
     * client treats absence as 'text' for safety. */
    const textFormat = getExtractedTextFormat(leafName, mimeType, text);
    const file = {
      ...baseFile,
      // Always set explicitly so an update which produces a binary or
      // oversized artifact clears any previously cached text — createFile
      // uses findOneAndUpdate with $set semantics.
      text: text ?? null,
      textFormat: textFormat ?? null,
      // Clear deferred-preview lifecycle fields in case the prior emit
      // at this (filename, conversationId) was an office file —
      // otherwise stale `pending`/`failed` would persist and the client
      // would render the wrong state for the now non-office artifact.
      status: null,
      previewError: null,
      previewRevision: null,
    };

    if (!(await commitCodeFile(file))) {
      return null;
    }
    return { file: Object.assign(file, { messageId, toolCallId, agentId }) };
  } catch (error) {
    if (error?.code === 'CODE_OUTPUT_DOWNLOAD_LIMIT') {
      logger.warn(
        `[processCodeOutput] Generated file exceeds size limit of ${(fileSizeLimit / megabyte).toFixed(2)} MB, falling back to download URL`,
      );
    }
    if (error?.message === 'Path traversal detected in filename') {
      logger.warn(
        `[processCodeOutput] Path traversal blocked for file "${name}" | conv=${conversationId}`,
      );
    }
    logAxiosError({
      message: 'Error downloading/processing code environment file',
      error,
    });
    logger.warn(
      `[processCodeOutput] Falling back to Code API download URL for strategy ${appConfig.fileStrategy}`,
    );

    // Fallback for download errors - return download URL so user can still manually download
    return {
      file: createDownloadFallback({
        id,
        name,
        agentId,
        messageId,
        toolCallId,
        session_id,
        conversationId,
        executionProfile,
        executionRouteKey,
        expiresAt: currentDate.getTime() + 86400000,
      }),
    };
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
 * @param {import('librechat-data-provider').CodeEnvRef} ref - Typed pointer
 *   into codeapi storage. Carries kind/id/storage_session_id/file_id;
 *   codeapi resolves the sessionKey from the request's auth context.
 * @param {ServerRequest} [req] - Current authenticated request, used to mint Code API auth.
 * @param {{baseUrl?: string, executionProfile?: 'default'|'stateful', bridgeWorkerId?: string}} [route]
 *   Trusted host-selected Code API route.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the `lastModified` time string of the file if successful, or null if there is an
 *          error in initialization or fetching the info.
 */
async function getSessionInfo(ref, req, route = {}) {
  try {
    const baseURL = route.baseUrl ?? getCodeBaseURL();
    const authHeaders = await getCodeApiAuthHeaders(req, route.bridgeWorkerId);
    /* `/sessions/.../objects/...` is gated by codeapi's `sessionAuth`
     * middleware (post-Phase C). The middleware reconstructs the
     * sessionKey from the URL query (`kind`/`id`/`version?`) plus the
     * requester's auth context, then matches it against the cached
     * sessionKey on the storage bucket. We have the full `codeEnvRef`
     * here, so pass kind+id (+version when skill) directly. */
    const query = buildCodeEnvDownloadQuery({
      kind: ref.kind,
      id: ref.id,
      ...(ref.kind === 'skill' ? { version: ref.version } : {}),
    });
    const response = await axios({
      method: 'get',
      url: `${baseURL}/sessions/${ref.storage_session_id}/objects/${ref.file_id}${query}`,
      headers: {
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
        ...(route.executionProfile
          ? codeExecutionHeaders({
              executionProfile: route.executionProfile,
              bridgeWorkerId: route.bridgeWorkerId,
            })
          : {}),
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 5000,
    });

    return response.data?.lastModified;
  } catch (_error) {
    logger.debug('[getSessionInfo] session lookup failed (treating as cache miss)');
    return null;
  }
}

const getPreviewContextSuffix = (file) => {
  if (file.status === 'pending') {
    return ' (preview not yet generated)';
  }

  if (file.status !== 'failed') {
    return '';
  }

  return file.previewError
    ? ` (preview unavailable: ${file.previewError})`
    : ' (preview unavailable)';
};

/**
 * A generated output is normally left out — the model already knows what it
 * wrote. That only holds while the file is still where it wrote it: once a
 * newer same-named file takes the bare path, the output mounts under a
 * suffixed name the model has never seen, and silence would leave it reading
 * the newcomer or failing to find its own artifact.
 */
const getVisibleCodeFileContextLine = (file, agentResourceIds, destination) => {
  const displaced = destination !== file.filename;
  if (file.context === FileContext.execute_code && !displaced) {
    return '';
  }

  const origin =
    file.context === FileContext.execute_code
      ? ` (written earlier as ${file.filename})`
      : `${agentResourceIds.has(file.file_id) ? '' : ' (attached by user)'}${
          displaced ? ` (uploaded as ${file.filename})` : ''
        }`;
  return `\n\t- /mnt/data/${destination}${origin}${getPreviewContextSuffix(file)}`;
};

const appendVisibleCodeFileContext = (toolContext, contextLine) => {
  if (!contextLine) {
    return toolContext;
  }

  if (toolContext) {
    return `${toolContext}${contextLine}`;
  }

  return `- Note: The following files are available in the "${Tools.execute_code}" tool environment:${contextLine}`;
};

class CodeResourceRecoveryError extends Error {
  constructor({ required, primed, failed }) {
    super(JSON.stringify({ type: ErrorTypes.RESOURCE_RECOVERY_REQUIRED }));
    this.name = 'CodeResourceRecoveryError';
    this.code = ErrorTypes.RESOURCE_RECOVERY_REQUIRED;
    this.status = 409;
    this.statusCode = 409;
    this.details = { required, primed, failed };
    this.required = required;
    this.primed = primed;
    this.failed = failed;
  }
}

const getPrimingCorrelation = (req) => ({
  requestId: req?.requestId ?? req?.id ?? 'unknown',
  runId: req?.body?.messageId ?? req?.body?.conversationId ?? 'unknown',
});

const getReuploadFailureCategory = (error) => {
  const status =
    error?.response?.status ??
    error?.statusCode ??
    error?.status ??
    error?.$metadata?.httpStatusCode;
  const code = error?.code ?? error?.name;
  if (
    status === 404 ||
    code === 'NoSuchKey' ||
    code === 'NotFound' ||
    code === 'BlobNotFound' ||
    code === 'ResourceNotFound'
  ) {
    return 'missing_backing_object';
  }
  if (
    status === 401 ||
    status === 403 ||
    code === 'AccessDenied' ||
    code === 'AccessDeniedException' ||
    code === 'Forbidden'
  ) {
    return 'resource_access_denied';
  }
  return 'reupload_failed';
};

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @param {string} [options.agentResourceType] - Permission resource type for the authorized agent route
 * @returns {Promise<{
 * files: Array<{ id: string; session_id: string; name: string }>,
 * toolContext: string,
 * }>}
 */
const primeFiles = async (options) => {
  const {
    tool_resources,
    req,
    agentId,
    agentResourceType,
    codeApiBaseUrl,
    executionProfile = 'default',
    executionRouteKey = executionProfile,
    bridgeWorkerId,
  } = options;
  const codeApiRoute = { baseUrl: codeApiBaseUrl, executionProfile, bridgeWorkerId };
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.execute_code]?.files ?? [];
  /** Runtime entries identify candidates only; database records remain authoritative for storage metadata. */
  const candidateFileIds = new Set(file_ids);
  for (const file of resourceFiles) {
    if (typeof file?.file_id === 'string') {
      candidateFileIds.add(file.file_id);
    }
  }

  /* Step 1 of the priming trace: input volume. Pair with the
   * per-file `[primeCodeFiles] file=...` lines and the final
   * `[primeCodeFiles] returned=...` line below to locate which
   * layer drops a file the sandbox doesn't end up seeing. */
  logger.debug(
    `[primeCodeFiles] in: file_ids=${file_ids.length} resourceFiles=${resourceFiles.length}`,
    { agentId, file_ids, resourceFileIds: resourceFiles.map((f) => f?.file_id) },
  );

  // Get all files first
  const allFiles =
    (await getFiles({ file_id: { $in: Array.from(candidateFileIds) } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
      resourceType: agentResourceType,
    });
  } else {
    dbFiles = allFiles;
  }

  const files = [];
  const sessions = new Map();
  let toolContext = '';

  /* Claim order decides which record keeps the bare `/mnt/data/<name>` path
   * when several share a filename, so it is fixed here rather than inherited
   * from `getFiles`'s `updatedAt` sort — usage accounting and re-upload both
   * bump `updatedAt`, which would repoint paths between turns. `file_ids` are
   * this agent's own resources; every other candidate came from the
   * conversation and is therefore seen by every agent in the run, so shared
   * files rank first and land on the same destination whichever agent primes
   * them. */
  const orderedFiles = sortCodeFilesByDestinationPriority(dbFiles, agentResourceIds);
  const destinations = createCodeDestinationSet();

  /* Per-file path counters — emitted at the bottom so a single
   * grep on `[primeCodeFiles]` shows the input volume, the per-file
   * paths taken, and the final dispatch summary in one trace. */
  let skippedNoRef = 0;
  let reuploadFailures = 0;
  let requiredCodeFiles = 0;
  const reuploadFailureCategories = new Set();

  for (let i = 0; i < orderedFiles.length; i++) {
    const file = orderedFiles[i];
    if (!file) {
      continue;
    }

    const ref = getCodeEnvRefForProfile(file.metadata, executionRouteKey);
    const sourceRef = ref ?? getCodeEnvRefs(file.metadata)[0]?.[1];
    if (!sourceRef) {
      skippedNoRef += 1;
      logger.debug(`[primeCodeFiles] file=${file.file_id} path=skip reason=no-codeenvref`);
      continue;
    }
    requiredCodeFiles += 1;
    const session_id = sourceRef.storage_session_id;
    const id = sourceRef.file_id;

    /**
     * `pushFile` accepts optional overrides so the reupload path can
     * push the FRESH `(storage_session_id, file_id)` from the new
     * `codeEnvRef`. Without these overrides, the closure would
     * capture the stale pre-reupload refs from the outer loop and
     * the in-memory `files` array (now consumed by
     * `buildInitialToolSessions` to seed `Graph.sessions`) would
     * point at a sandbox object that no longer exists. The DB record
     * gets the new ref via `updateFile`, but the seed would still
     * inject the old one — bash_tool / read_file would 404 trying to
     * mount the file until the next turn re-reads metadata.
     *
     * `kind`, `id`, `version` are preserved on the in-memory ref so
     * codeapi can resolve sessionKey per-file (kind switch +
     * tenant prefix from auth context).
     */
    const pushFile = (overrideSessionId, overrideId) => {
      /* Claimed here rather than up front so files that never reach the
       * sandbox — no code-env ref, or a failed re-upload — do not reserve a
       * name and push a file that does reach it onto a counter. */
      const destination = claimCodeDestination(destinations, file.filename, file.file_id);
      if (destination !== file.filename) {
        logger.debug(
          `[primeCodeFiles] file=${file.file_id} destination=${destination} ` +
            `reason=name-collision filename=${file.filename}`,
        );
      }
      toolContext = appendVisibleCodeFileContext(
        toolContext,
        getVisibleCodeFileContextLine(file, agentResourceIds, destination),
      );
      /* `id` is the storage file_id (drives codeapi's upload-key
       * existence check), `resource_id` is the entity that owns
       * the storage session (drives sessionKey re-derivation). For
       * code-output files this is `kind: 'user'` and `resource_id`
       * is informational (codeapi ignores it for user kind), but
       * we still send it for shape uniformity with shared kinds. */
      files.push({
        id: overrideId ?? id,
        resource_id: sourceRef.id,
        storage_session_id: overrideSessionId ?? session_id,
        name: destination,
        kind: sourceRef.kind,
        ...(sourceRef.kind === 'skill' ? { version: sourceRef.version } : {}),
      });
    };

    const reuploadFile = async () => {
      try {
        const { getDownloadStream } = getStrategyFunctions(file.source);
        const { handleFileUpload: uploadCodeEnvFile } = getStrategyFunctions(
          FileSources.execute_code,
        );
        const stream = await getDownloadStream(options.req, file.filepath);
        /* Reupload preserves the resource identity from the existing
         * ref so codeapi re-buckets under the same sessionKey shape
         * (skill stays skill, user stays user). Without this, a
         * skill-cache-miss reupload would land in the user bucket
         * and never re-shareable cross-user. */
        const uploaded = await uploadCodeEnvFile({
          req: options.req,
          stream,
          filename: file.filename,
          kind: sourceRef.kind,
          id: sourceRef.id,
          ...(sourceRef.kind === 'skill' ? { version: sourceRef.version } : {}),
          codeApiBaseUrl,
          executionProfile,
          bridgeWorkerId,
        });

        /**
         * Use the FRESH `(storage_session_id, file_id)` from the
         * reupload response and route it through the dedupe Map, the
         * persisted record, and the in-memory `files` list. The
         * original ref captured at the top of this iteration refers
         * to the old, expired/missing sandbox object — using it here
         * would silently re-introduce the bug `Graph.sessions`
         * seeding is supposed to fix.
         *
         * `kind`, `id`, `version` survive the round-trip: the
         * upload preserves the resource identity, only the storage
         * pointer changes.
         */
        const newRef = {
          kind: sourceRef.kind,
          id: sourceRef.id,
          storage_session_id: uploaded.storage_session_id,
          file_id: uploaded.file_id,
          executionProfile,
          ...(executionRouteKey !== executionProfile ? { executionRouteKey } : {}),
          ...(sourceRef.kind === 'skill' ? { version: sourceRef.version } : {}),
        };

        const updatedRefs = mergeCodeEnvRef(file.metadata, newRef);

        await updateFile({
          file_id: file.file_id,
          'metadata.codeEnvRef': updatedRefs.codeEnvRef,
          [`metadata.codeEnvRefs.${executionRouteKey}`]: newRef,
        });
        sessions.set(newRef.storage_session_id, true);
        pushFile(newRef.storage_session_id, newRef.file_id);
        logger.debug(
          `[primeCodeFiles] file=${file.file_id} path=reupload-success ` +
            `oldSession=${session_id} newSession=${newRef.storage_session_id} newFileId=${newRef.file_id}`,
        );
      } catch (error) {
        reuploadFailures += 1;
        const failureCategory = getReuploadFailureCategory(error);
        reuploadFailureCategories.add(failureCategory);
        const { requestId, runId } = getPrimingCorrelation(req);
        logger.error(
          `[primeCodeFiles] reupload-failed requestId=${requestId} runId=${runId} ` +
            `category=${failureCategory}`,
        );
      }
    };
    if (!ref) {
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=reupload reason=profile-missing ` +
          `requestedProfile=${executionProfile}`,
      );
      await reuploadFile();
      continue;
    }
    if (sessions.has(session_id)) {
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=cache-hit-by-session storage_session_id=${session_id}`,
      );
      pushFile();
      continue;
    }
    const uploadTime = await getSessionInfo(ref, req, codeApiRoute);
    if (!uploadTime) {
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=reupload reason=no-uploadtime ` +
          `storage_session_id=${session_id}`,
      );
      await reuploadFile();
      continue;
    }
    if (!checkIfActive(uploadTime)) {
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=reupload reason=stale ` +
          `uploadTime=${uploadTime} storage_session_id=${session_id}`,
      );
      await reuploadFile();
      continue;
    }
    sessions.set(session_id, true);
    logger.debug(
      `[primeCodeFiles] file=${file.file_id} path=fresh-active storage_session_id=${session_id}`,
    );
    pushFile();
  }

  /* Dispatch summary — emitted unconditionally so a single grep on
   * `[primeCodeFiles] out` always shows the final state, not only
   * the per-path trail leading up to it. */
  const primedCodeFiles = files.length;
  const allRequiredResourcesFailed =
    requiredCodeFiles > 0 && primedCodeFiles === 0 && reuploadFailures === requiredCodeFiles;
  const { requestId, runId } = getPrimingCorrelation(req);
  logger.debug(
    `[primeCodeFiles] out: returned=${files.length} ` +
      `required=${requiredCodeFiles} skippedNoRef=${skippedNoRef} reuploadFailures=${reuploadFailures}`,
  );

  if (allRequiredResourcesFailed) {
    const failureCategory =
      reuploadFailureCategories.size === 1
        ? Array.from(reuploadFailureCategories)[0]
        : 'mixed_reupload_failure';
    logger.warn(
      `[primeCodeFiles] resource-recovery-required requestId=${requestId} runId=${runId} ` +
        `required=${requiredCodeFiles} primed=${primedCodeFiles} failed=${reuploadFailures} ` +
        `category=${failureCategory}`,
    );
    throw new CodeResourceRecoveryError({
      required: requiredCodeFiles,
      primed: primedCodeFiles,
      failed: reuploadFailures,
    });
  }

  return { files, toolContext };
};

/**
 * Reads a single file from the code-execution sandbox by shelling `cat`
 * through the sandbox `/exec` endpoint. Used by the `read_file` host
 * handler when the requested path is a code-env path (`/mnt/data/...`)
 * or otherwise not resolvable as a skill file. Resolves to
 * `{ content }` from stdout on success, or `null` when the codeapi base
 * URL isn't configured / the read returns no content (caller turns that
 * into a model-visible error). Throws axios-style errors on transport
 * failure so the caller can surface a meaningful error message.
 *
 * `session_id` and `files` come from the seeded `tc.codeSessionContext`
 * (emitted by the agents-side `ToolNode` for `read_file` calls in
 * v3.1.72+) so the read lands in the same sandbox session that holds
 * the agent's prior-turn artifacts.
 *
 * @param {Object} params
 * @param {string} params.file_path - Absolute path inside the sandbox (e.g. `/mnt/data/foo.txt`).
 * @param {string} [params.session_id] - Sandbox session id from the seeded context.
 * @param {Array<{id: string, name: string, session_id?: string}>} [params.files] - File refs to mount.
 * @param {ServerRequest} [params.req] - Current authenticated request, used to mint Code API auth.
 * @returns {Promise<{content: string} | null>}
 */
async function readSandboxFile({
  file_path,
  session_id,
  files,
  runtime_session_hint,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
}) {
  const baseURL = codeApiBaseUrl ?? getCodeBaseURL();
  if (!baseURL) {
    return null;
  }

  /** Single-quote `file_path` with embedded-quote escaping so a malicious
   *  filename can't break out of the `cat` command. The handler upstream
   *  has already established this is a code-env path the model
   *  legitimately asked to read; this just keeps the shell quoting safe. */
  const safePath = `'${file_path.replace(/'/g, `'\\''`)}'`;
  /** @type {Record<string, unknown>} */
  const postData = { lang: 'bash', code: `cat ${safePath}` };
  if (session_id) {
    postData.session_id = session_id;
  }
  if (runtime_session_hint) {
    postData.runtime_session_hint = runtime_session_hint;
  }
  if (files && files.length > 0) {
    postData.files = files;
  }

  let response;
  try {
    const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
    response = await axios({
      method: 'post',
      url: `${baseURL}/exec`,
      data: postData,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
        ...(executionProfile ? codeExecutionHeaders({ executionProfile, bridgeWorkerId }) : {}),
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    });
  } catch (error) {
    logAxiosError({
      message: `Error reading sandbox file "${file_path}"`,
      error,
    });
    throw error;
  }

  const result = response?.data ?? {};
  if (result.stderr && (result.stdout == null || result.stdout === '')) {
    const reason = String(result.stderr).trim();
    /** An absent path is the ordinary outcome, not a fault: `create_file`
     *  reads its target before writing so it can tell a create from an
     *  overwrite. Logging that at error level with a stack made every
     *  file creation look like a file that had gone missing. */
    if (isMissingSandboxPathError(reason)) {
      logger.debug(`[readSandboxFile] "${file_path}" is not present in the sandbox: ${reason}`);
    } else {
      logger.error(`[readSandboxFile] Error reading sandbox file "${file_path}": ${reason}`);
    }
    throw new Error(reason);
  }
  if (result.stdout == null) {
    return null;
  }
  return { content: String(result.stdout) };
}

/**
 * Reads a bounded range from the workspace directory registered by an attached worker.
 * The authenticated worker route is derived from the selected environment and
 * the host path remains private to the worker.
 *
 * @param {Object} params
 * @param {string} params.file_path
 * @param {string} params.workspace_id
 * @param {number} params.start_line
 * @param {number} params.max_lines
 * @param {string} params.codeApiBaseUrl
 * @param {'default' | 'stateful'} params.executionProfile
 * @param {string} [params.bridgeWorkerId]
 * @param {ServerRequest} [params.req]
 * @param {AbortSignal} [params.signal]
 */
async function readWorkspaceFile({
  file_path,
  workspace_id,
  start_line,
  max_lines,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'read_file',
      workspaceId: workspace_id,
      path: file_path,
      startLine: start_line,
      maxLines: max_lines,
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * Searches literal text within the workspace directory registered by an attached worker.
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {string} params.workspace_id
 * @param {string} [params.path]
 * @param {number} params.max_results
 * @param {string} params.codeApiBaseUrl
 * @param {'default' | 'stateful'} params.executionProfile
 * @param {string} [params.bridgeWorkerId]
 * @param {ServerRequest} [params.req]
 * @param {AbortSignal} [params.signal]
 */
async function searchWorkspace({
  query,
  workspace_id,
  path,
  max_results,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'search_text',
      workspaceId: workspace_id,
      query,
      ...(path ? { path } : {}),
      maxResults: max_results,
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * Lists relative files within the workspace directory registered by an attached worker.
 *
 * @param {Object} params
 * @param {string} params.workspace_id
 * @param {string} [params.path]
 * @param {string} [params.after_path]
 * @param {number} params.max_results
 * @param {string} params.codeApiBaseUrl
 * @param {'default' | 'stateful'} params.executionProfile
 * @param {string} [params.bridgeWorkerId]
 * @param {ServerRequest} [params.req]
 * @param {AbortSignal} [params.signal]
 */
async function listWorkspaceFiles({
  workspace_id,
  path,
  after_path,
  max_results,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'list_files',
      workspaceId: workspace_id,
      ...(path ? { path } : {}),
      ...(after_path ? { afterPath: after_path } : {}),
      maxResults: max_results,
    },
    ...(signal ? { signal } : {}),
  });
}

/** Writes a UTF-8 file in the workspace registered by an attached worker. */
async function writeWorkspaceFile({
  file_path,
  content,
  overwrite,
  workspace_id,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'write_file',
      workspaceId: workspace_id,
      path: file_path,
      content,
      overwrite,
    },
    ...(signal ? { signal } : {}),
  });
}

/** Applies an ordered exact-edit batch in one attached-worker mutation. */
async function editWorkspaceFile({
  file_path,
  edits,
  expected_base_sha256,
  workspace_id,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'edit_file',
      workspaceId: workspace_id,
      path: file_path,
      edits,
      ...(expected_base_sha256 ? { expectedBaseSha256: expected_base_sha256 } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

/** Previews an ordered exact-edit batch without mutating the attached workspace. */
async function previewWorkspaceEdit({
  file_path,
  edits,
  workspace_id,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
  signal,
}) {
  const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
  return executeWorkspaceTool({
    baseURL: codeApiBaseUrl,
    authHeaders: {
      ...authHeaders,
      ...codeExecutionHeaders({ executionProfile, bridgeWorkerId }),
    },
    request: {
      protocolVersion: 1,
      operation: 'preview_edit',
      workspaceId: workspace_id,
      path: file_path,
      edits,
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * Reads a small code artifact as base64 so `read_file` can surface it to
 * vision-capable models. Reuses bytes fetched by the current request's
 * artifact preflight when the requested path resolves to the exact returned
 * file ref; otherwise falls back to the code-execution sandbox.
 * `readSandboxFile`'s
 * `cat` round-trips stdout through codeapi's JSON transport, which lossily
 * replaces non-UTF-8 bytes and corrupts image data. The in-sandbox reader
 * base64-encodes the bytes instead, so the payload stays ASCII-safe across
 * the JSON `/exec` transport. Session forwarding mirrors `readSandboxFile`
 * so the read lands in the same sandbox session that holds the agent's
 * prior-turn artifacts.
 *
 * Windowing, window sizing, and assembly live in `@librechat/api`
 * (`readWindowedSandboxImage`); this function is the `/exec` transport it
 * calls, plus the rate-limit wait that keeps a multi-window read from
 * discarding the bytes it already pulled.
 *
 * @param {Object} params
 * @param {string} params.file_path - Path inside the sandbox (e.g. `/mnt/data/chart.png`).
 * @param {string} [params.session_id] - Sandbox session id from the seeded context.
 * @param {Array<{id: string, name: string, session_id?: string}>} [params.files] - File refs to mount.
 * @param {string} [params.runtime_session_hint] - Per-conversation stateful runtime-session hint.
 * @param {number} [params.maxBytes] - In-sandbox size cap; larger files return `{ tooLarge, bytes }`.
 * @param {ServerRequest} [params.req] - Current authenticated request, used to mint Code API auth.
 * @param {string} [params.executionRouteKey] - Trusted deployment-local route identity.
 * @param {string} [params.bridgeWorkerId] - Trusted bridge worker selected for this execution.
 * @returns {Promise<{base64: string, bytes: number}
 *   | {tooLarge: true, reason: 'size' | 'round_trips', bytes: number} | null>}
 *   `null` when codeapi is unavailable; throws on transport / read errors.
 */
async function readSandboxImage({
  file_path,
  session_id,
  files,
  runtime_session_hint,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  executionRouteKey,
  maxBytes,
  req,
}) {
  const limit = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 5 * megabyte;
  const preparedBuffer = getPreparedCodeOutputBuffer({
    req,
    file_path,
    session_id,
    files,
    codeApiBaseUrl,
    executionProfile,
    executionRouteKey,
  });
  if (preparedBuffer) {
    if (preparedBuffer.length > limit) {
      return { tooLarge: true, reason: 'size', bytes: preparedBuffer.length };
    }
    return { base64: preparedBuffer.toString('base64'), bytes: preparedBuffer.length };
  }

  const baseURL = codeApiBaseUrl ?? getCodeBaseURL();
  if (!baseURL) {
    return null;
  }

  /** Every window is one `/exec` call against the Code API's per-user
   *  execution limiter, so the read shares one wait budget: a window that
   *  resets mid-read is worth pausing for, an exhausted budget is not. */
  const rateLimit = createCodeApiRateLimitBudget();
  return readWindowedSandboxImage({
    filePath: file_path,
    baseUrl: baseURL,
    limit,
    readChunk: ({ code }) =>
      execSandboxImageChunk({
        baseURL,
        code,
        file_path,
        session_id,
        runtime_session_hint,
        executionProfile,
        bridgeWorkerId,
        files,
        req,
        rateLimit,
      }),
  });
}

/**
 * Runs one image-window read over `/exec` and hands the response to the
 * shared parser. Rate limits are waited out inside the shared budget; a
 * truncated response comes back as a chunk the reader narrows for, not an
 * error, so it is neither logged nor thrown here.
 * @returns {Promise<import('@librechat/api').SandboxImageChunk>}
 */
async function execSandboxImageChunk({
  baseURL,
  code,
  file_path,
  session_id,
  runtime_session_hint,
  executionProfile,
  bridgeWorkerId,
  files,
  req,
  rateLimit,
}) {
  /** @type {Record<string, unknown>} */
  const postData = { lang: 'bash', code };
  if (session_id) {
    postData.session_id = session_id;
  }
  if (runtime_session_hint) {
    postData.runtime_session_hint = runtime_session_hint;
  }
  if (files && files.length > 0) {
    postData.files = files;
  }

  try {
    const response = await withCodeApiRateLimit({
      label: `reading "${file_path}" from the sandbox`,
      budget: rateLimit,
      onWait: (waitMs) =>
        logger.warn(
          `[readSandboxImage] Rate-limited reading "${file_path}"; retrying in ${waitMs}ms`,
        ),
      attempt: async () => {
        const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
        return axios({
          method: 'post',
          url: `${baseURL}/exec`,
          data: postData,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LibreChat/1.0',
            ...authHeaders,
            ...(executionProfile ? codeExecutionHeaders({ executionProfile, bridgeWorkerId }) : {}),
          },
          httpAgent: codeServerHttpAgent,
          httpsAgent: codeServerHttpsAgent,
          timeout: 15000,
        });
      },
    });
    return parseSandboxImageChunk(response?.data ?? {});
  } catch (error) {
    logAxiosError({
      message: `Error reading sandbox image "${file_path}"`,
      error,
    });
    throw error;
  }
}

/**
 * Writes a UTF-8 text file into the code-execution sandbox by running a
 * small Python writer through the sandbox `/exec` endpoint. The payload is
 * base64-encoded JSON so neither the file path nor the content is
 * interpolated into shell syntax.
 *
 * @param {Object} params
 * @param {string} params.file_path - Path inside the sandbox (prefer `/mnt/data/...`).
 * @param {string} params.content - Complete UTF-8 text content to write.
 * @param {string} [params.session_id] - Sandbox session id from the seeded context.
 * @param {Array<{id: string, name: string, session_id?: string}>} [params.files] - File refs to mount.
 * @param {ServerRequest} [params.req] - Current authenticated request, used to mint Code API auth.
 * @returns {Promise<{stdout?: string, stderr?: string, session_id?: string, files?: Array<Object>} | null>}
 */
async function writeSandboxFile({
  file_path,
  content,
  session_id,
  files,
  runtime_session_hint,
  codeApiBaseUrl,
  executionProfile,
  bridgeWorkerId,
  req,
}) {
  const baseURL = codeApiBaseUrl ?? getCodeBaseURL();
  if (!baseURL) {
    return null;
  }

  const payload = Buffer.from(
    JSON.stringify({
      file_path,
      content_b64: Buffer.from(content, 'utf8').toString('base64'),
    }),
    'utf8',
  ).toString('base64');
  const code = [
    "python3 - <<'PY'",
    'import base64, json, os',
    `payload = ${JSON.stringify(payload)}`,
    "data = json.loads(base64.b64decode(payload).decode('utf-8'))",
    "path = data['file_path']",
    "content = base64.b64decode(data['content_b64'])",
    'parent = os.path.dirname(path)',
    'if parent:',
    '    os.makedirs(parent, exist_ok=True)',
    "with open(path, 'wb') as f:",
    '    f.write(content)',
    'print(f"WROTE {len(content)} bytes to {path}")',
    'PY',
  ].join('\n');

  /** @type {Record<string, unknown>} */
  const postData = { lang: 'bash', code };
  if (session_id) {
    postData.session_id = session_id;
  }
  if (runtime_session_hint) {
    postData.runtime_session_hint = runtime_session_hint;
  }
  if (files && files.length > 0) {
    postData.files = files;
  }

  try {
    const authHeaders = await getCodeApiAuthHeaders(req, bridgeWorkerId);
    const response = await axios({
      method: 'post',
      url: `${baseURL}/exec`,
      data: postData,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
        ...(executionProfile ? codeExecutionHeaders({ executionProfile, bridgeWorkerId }) : {}),
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    });
    const result = response?.data ?? {};
    if (result.stderr && (result.stdout == null || result.stdout === '')) {
      throw new Error(String(result.stderr).trim());
    }
    if (result.stdout == null && result.session_id == null) {
      return null;
    }
    return {
      stdout: result.stdout == null ? undefined : String(result.stdout),
      stderr: result.stderr == null ? undefined : String(result.stderr),
      session_id: result.session_id,
      files: result.files,
    };
  } catch (error) {
    logAxiosError({
      message: `Error writing sandbox file "${file_path}"`,
      error,
    });
    throw error;
  }
}

module.exports = {
  CodeResourceRecoveryError,
  primeFiles,
  checkIfActive,
  getSessionInfo,
  processCodeOutput,
  prepareCodeOutputForInspection,
  readWorkspaceFile,
  searchWorkspace,
  listWorkspaceFiles,
  writeWorkspaceFile,
  previewWorkspaceEdit,
  editWorkspaceFile,
  readSandboxFile,
  readSandboxImage,
  writeSandboxFile,
  runPreviewFinalize,
};
