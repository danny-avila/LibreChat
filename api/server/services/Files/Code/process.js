const path = require('path');
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
  classifyCodeArtifact,
  codeServerHttpAgent,
  codeServerHttpsAgent,
  extractCodeArtifactText,
  getExtractedTextFormat,
  getStorageMetadata,
  buildCodeEnvDownloadQuery,
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
  mergeFileConfig,
  getEndpointFileConfig,
} = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { createFile, getFiles, updateFile, claimCodeFile } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { getRetentionExpiry } = require('~/server/services/Files/retention');
const { determineFileType } = require('~/server/utils');

const axios = createAxiosInstance();

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
}) => {
  const basePath = getBasePath();
  return {
    filename: name,
    filepath: `${basePath}/api/files/code/download/${session_id}/${id}`,
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
}) => {
  const appConfig = req.config;
  const currentDate = new Date();
  const baseURL = getCodeBaseURL();
  const fileExt = path.extname(name).toLowerCase();
  const isImage = fileExt && imageExtRegex.test(name);

  const mergedFileConfig = mergeFileConfig(appConfig.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  const fileSizeLimit = endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit;

  try {
    const formattedDate = currentDate.toISOString();
    const authHeaders = await getCodeApiAuthHeaders(req);
    /* Code-output files are always user-private — no skill execution
     * produces a skill-scoped output bucket. The download URL must
     * carry `?kind=user&id=<userId>` so codeapi's `sessionAuth`
     * resolves the matching `<tenant>:user:<userId>` sessionKey. See
     * codeapi #1455 / Phase C. */
    const downloadQuery = buildCodeEnvDownloadQuery({ kind: 'user', id: req.user.id });
    const response = await axios({
      method: 'get',
      url: `${baseURL}/download/${session_id}/${id}${downloadQuery}`,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    });

    const buffer = Buffer.from(response.data, 'binary');

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
        user: req.user.id,
        tenantId: req.user.tenantId,
        type: `image/${appConfig.imageOutputType}`,
        createdAt: isUpdate ? claimed.createdAt : formattedDate,
        updatedAt: formattedDate,
        source: appConfig.fileStrategy,
        context: FileContext.execute_code,
        metadata: { codeEnvRef, sourceDispatchedAt },
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
      metadata: { codeEnvRef, sourceDispatchedAt },
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
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the `lastModified` time string of the file if successful, or null if there is an
 *          error in initialization or fetching the info.
 */
async function getSessionInfo(ref, req) {
  try {
    const baseURL = getCodeBaseURL();
    const authHeaders = await getCodeApiAuthHeaders(req);
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
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 5000,
    });

    return response.data?.lastModified;
  } catch (error) {
    logger.debug(
      `[getSessionInfo] session lookup failed (treating as cache miss): ${error?.message ?? String(error)}`,
    );
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

const getVisibleCodeFileContextLine = (file, agentResourceIds) => {
  if (file.context === FileContext.execute_code) {
    return '';
  }

  const fileSuffix = agentResourceIds.has(file.file_id) ? '' : ' (attached by user)';
  return `\n\t- /mnt/data/${file.filename}${fileSuffix}${getPreviewContextSuffix(file)}`;
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

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @returns {Promise<{
 * files: Array<{ id: string; session_id: string; name: string }>,
 * toolContext: string,
 * }>}
 */
const primeFiles = async (options) => {
  const { tool_resources, req, agentId } = options;
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.execute_code]?.files ?? [];

  /* Step 1 of the priming trace: input volume. Pair with the
   * per-file `[primeCodeFiles] file=...` lines and the final
   * `[primeCodeFiles] returned=...` line below to locate which
   * layer drops a file the sandbox doesn't end up seeing. */
  logger.debug(
    `[primeCodeFiles] in: file_ids=${file_ids.length} resourceFiles=${resourceFiles.length}`,
    { agentId, file_ids, resourceFileIds: resourceFiles.map((f) => f?.file_id) },
  );

  // Get all files first
  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  const files = [];
  const sessions = new Map();
  let toolContext = '';

  /* Per-file path counters — emitted at the bottom so a single
   * grep on `[primeCodeFiles]` shows the input volume, the per-file
   * paths taken, and the final dispatch summary in one trace. */
  let skippedNoRef = 0;
  let reuploadFailures = 0;

  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }

    const ref = file.metadata?.codeEnvRef;
    if (!ref) {
      skippedNoRef += 1;
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=skip reason=no-codeenvref filename=${file.filename}`,
      );
      continue;
    }
    const session_id = ref.storage_session_id;
    const id = ref.file_id;

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
      toolContext = appendVisibleCodeFileContext(
        toolContext,
        getVisibleCodeFileContextLine(file, agentResourceIds),
      );
      /* `id` is the storage file_id (drives codeapi's upload-key
       * existence check), `resource_id` is the entity that owns
       * the storage session (drives sessionKey re-derivation). For
       * code-output files this is `kind: 'user'` and `resource_id`
       * is informational (codeapi ignores it for user kind), but
       * we still send it for shape uniformity with shared kinds. */
      files.push({
        id: overrideId ?? id,
        resource_id: ref.id,
        storage_session_id: overrideSessionId ?? session_id,
        name: file.filename,
        kind: ref.kind,
        ...(ref.kind === 'skill' ? { version: ref.version } : {}),
      });
    };

    if (sessions.has(session_id)) {
      logger.debug(
        `[primeCodeFiles] file=${file.file_id} path=cache-hit-by-session storage_session_id=${session_id}`,
      );
      pushFile();
      continue;
    }

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
          kind: ref.kind,
          id: ref.id,
          ...(ref.kind === 'skill' ? { version: ref.version } : {}),
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
          kind: ref.kind,
          id: ref.id,
          storage_session_id: uploaded.storage_session_id,
          file_id: uploaded.file_id,
          ...(ref.kind === 'skill' ? { version: ref.version } : {}),
        };

        const updatedMetadata = {
          ...file.metadata,
          codeEnvRef: newRef,
        };

        await updateFile({
          file_id: file.file_id,
          metadata: updatedMetadata,
        });
        sessions.set(newRef.storage_session_id, true);
        pushFile(newRef.storage_session_id, newRef.file_id);
        logger.debug(
          `[primeCodeFiles] file=${file.file_id} path=reupload-success ` +
            `oldSession=${session_id} newSession=${newRef.storage_session_id} newFileId=${newRef.file_id}`,
        );
      } catch (error) {
        reuploadFailures += 1;
        logger.error(
          `[primeCodeFiles] file=${file.file_id} path=reupload-failed session=${session_id}: ${error.message}`,
          error,
        );
      }
    };
    const uploadTime = await getSessionInfo(ref, req);
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
  logger.debug(
    `[primeCodeFiles] out: returned=${files.length} ` +
      `skippedNoRef=${skippedNoRef} reuploadFailures=${reuploadFailures}`,
  );

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
async function readSandboxFile({ file_path, session_id, files, runtime_session_hint, req }) {
  const baseURL = getCodeBaseURL();
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

  try {
    const authHeaders = await getCodeApiAuthHeaders(req);
    const response = await axios({
      method: 'post',
      url: `${baseURL}/exec`,
      data: postData,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    });
    const result = response?.data ?? {};
    if (result.stderr && (result.stdout == null || result.stdout === '')) {
      throw new Error(String(result.stderr).trim());
    }
    if (result.stdout == null) {
      return null;
    }
    return { content: String(result.stdout) };
  } catch (error) {
    logAxiosError({
      message: `Error reading sandbox file "${file_path}"`,
      error,
    });
    throw error;
  }
}

/**
 * Reads a small image file out of the code-execution sandbox as base64 so
 * `read_file` can surface it to vision-capable models. `readSandboxFile`'s
 * `cat` round-trips stdout through codeapi's JSON transport, which lossily
 * replaces non-UTF-8 bytes and corrupts image data. Here a tiny Python
 * reader stats the file, refuses (without transferring) anything over
 * `maxBytes`, and otherwise base64-encodes the bytes IN the sandbox so the
 * payload stays ASCII-safe across the JSON `/exec` transport. Session
 * forwarding mirrors `readSandboxFile` so the read lands in the same
 * sandbox session that holds the agent's prior-turn artifacts.
 *
 * @param {Object} params
 * @param {string} params.file_path - Path inside the sandbox (e.g. `/mnt/data/chart.png`).
 * @param {string} [params.session_id] - Sandbox session id from the seeded context.
 * @param {Array<{id: string, name: string, session_id?: string}>} [params.files] - File refs to mount.
 * @param {string} [params.runtime_session_hint] - Per-conversation stateful runtime-session hint.
 * @param {number} [params.maxBytes] - In-sandbox size cap; larger files return `{ tooLarge, bytes }`.
 * @param {ServerRequest} [params.req] - Current authenticated request, used to mint Code API auth.
 * @returns {Promise<{base64: string, bytes: number} | {tooLarge: true, bytes: number} | null>}
 *   `null` when codeapi is unavailable; throws on transport / read errors.
 */
async function readSandboxImage({
  file_path,
  session_id,
  files,
  runtime_session_hint,
  maxBytes,
  req,
}) {
  const baseURL = getCodeBaseURL();
  if (!baseURL) {
    return null;
  }

  const limit = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 5 * megabyte;
  const chunkBytes = getImageChunkBytes();
  const maxChunks = Math.ceil(limit / chunkBytes) + 1;

  /** @type {Buffer[]} */
  const parts = [];
  let offset = 0;
  let total = null;

  for (let i = 0; i < maxChunks; i++) {
    const payload = Buffer.from(
      JSON.stringify({ file_path, limit, offset, chunk: chunkBytes }),
      'utf8',
    ).toString('base64');
    const code = [
      "python3 - <<'PY'",
      'import base64, json, os, stat',
      `payload = ${JSON.stringify(payload)}`,
      "data = json.loads(base64.b64decode(payload).decode('utf-8'))",
      "p = data['file_path']",
      "limit = data['limit']",
      "offset = data['offset']",
      "chunk = data['chunk']",
      'try:',
      '    st = os.stat(p)',
      'except OSError as e:',
      '    print(json.dumps({"error": str(e)}))',
      '    raise SystemExit(0)',
      // Reject FIFOs, sockets, and device files (e.g. a symlink to /dev/zero):
      // os.stat can report a small/zero size while an unbounded read blocks or
      // streams forever until the request times out.
      'if not stat.S_ISREG(st.st_mode):',
      '    print(json.dumps({"error": "not a regular file"}))',
      '    raise SystemExit(0)',
      'if st.st_size > limit:',
      '    print(json.dumps({"too_large": True, "bytes": st.st_size}))',
      '    raise SystemExit(0)',
      // Read only this window. The whole base64 payload cannot be emitted in
      // one shot: the runner caps stdout at SANDBOX_OUTPUT_MAX_SIZE (1024
      // bytes by default) and SIGKILLs the job on overflow, which truncates
      // the JSON mid-string. Windowing keeps every response under that cap.
      "with open(p, 'rb') as f:",
      '    f.seek(offset)',
      '    raw = f.read(chunk)',
      'print(json.dumps({"total": st.st_size, "n": len(raw), "b64": base64.b64encode(raw).decode("ascii")}))',
      'PY',
    ].join('\n');

    const parsed = await execSandboxImageChunk({
      baseURL,
      code,
      file_path,
      session_id,
      runtime_session_hint,
      files,
      req,
      chunkBytes,
    });

    if (parsed.error) {
      throw new Error(String(parsed.error));
    }
    if (parsed.too_large === true) {
      return { tooLarge: true, bytes: Number(parsed.bytes) || 0 };
    }
    if (typeof parsed.b64 !== 'string' || typeof parsed.n !== 'number') {
      return null;
    }

    if (total == null) {
      total = Number(parsed.total) || 0;
      if (total > limit) {
        return { tooLarge: true, bytes: total };
      }
    } else if (Number(parsed.total) !== total) {
      /* The file changed underneath us; a spliced-together buffer would be
       * a mix of two versions rather than any real image. */
      throw new Error(`"${file_path}" changed while being read from the sandbox`);
    }

    parts.push(Buffer.from(parsed.b64, 'base64'));
    offset += parsed.n;

    if (parsed.n === 0 || offset >= total) {
      break;
    }
  }

  const buffer = Buffer.concat(parts);
  if (total == null) {
    return null;
  }
  if (buffer.length !== total) {
    /* Ran out of chunk budget (or short reads); returning a partial image
     * would render as a corrupt file, so surface it as unreadable-inline. */
    return { tooLarge: true, bytes: total };
  }
  return { base64: buffer.toString('base64'), bytes: buffer.length };
}

/**
 * Raw bytes pulled per `/exec` round-trip when inlining a sandbox image.
 * Each chunk is base64-encoded (~1.33x) into the response's stdout, which
 * the runner truncates + SIGKILLs past `SANDBOX_OUTPUT_MAX_SIZE`. The
 * default leaves headroom for a runner configured at 64KB; deployments
 * with a smaller cap must lower this, and a larger cap can raise it to cut
 * round-trips.
 * @returns {number}
 */
function getImageChunkBytes() {
  const parsed = Number(process.env.LIBRECHAT_CODE_IMAGE_CHUNK_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 32 * 1024;
}

/**
 * Runs one image-chunk read over `/exec` and parses its JSON line.
 * @returns {Promise<Record<string, unknown>>}
 */
async function execSandboxImageChunk({
  baseURL,
  code,
  file_path,
  session_id,
  runtime_session_hint,
  files,
  req,
  chunkBytes,
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
    const authHeaders = await getCodeApiAuthHeaders(req);
    const response = await axios({
      method: 'post',
      url: `${baseURL}/exec`,
      data: postData,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
      },
      httpAgent: codeServerHttpAgent,
      httpsAgent: codeServerHttpsAgent,
      timeout: 15000,
    });
    const result = response?.data ?? {};
    /* The runner truncates stdout at SANDBOX_OUTPUT_MAX_SIZE and SIGKILLs the
     * job (status `OL`). Detect that explicitly: the surviving stdout is a
     * base64 string cut mid-flight, so parsing it yields a misleading
     * "unexpected output" instead of naming the real, fixable cause. */
    if (result.status === 'OL') {
      throw new Error(
        `Reading "${file_path}" exceeded the sandbox stdout limit (chunk ${chunkBytes} bytes). ` +
          'Lower LIBRECHAT_CODE_IMAGE_CHUNK_BYTES or raise SANDBOX_OUTPUT_MAX_SIZE on the runner.',
      );
    }
    if (result.stderr && (result.stdout == null || result.stdout === '')) {
      throw new Error(String(result.stderr).trim());
    }
    if (result.stdout == null || String(result.stdout).trim() === '') {
      return {};
    }
    /* Parse the LAST non-empty line: the reader's JSON is the final thing it
     * prints, so anything a shell profile or library emitted ahead of it
     * (banners, warnings) must not break the read. */
    const lines = String(result.stdout)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      return JSON.parse(lines[lines.length - 1]);
    } catch {
      throw new Error(
        `Unexpected output while reading image bytes from the sandbox: ${String(result.stdout).slice(0, 120)}`,
      );
    }
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
  req,
}) {
  const baseURL = getCodeBaseURL();
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
    const authHeaders = await getCodeApiAuthHeaders(req);
    const response = await axios({
      method: 'post',
      url: `${baseURL}/exec`,
      data: postData,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat/1.0',
        ...authHeaders,
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
  primeFiles,
  checkIfActive,
  getSessionInfo,
  processCodeOutput,
  readSandboxFile,
  readSandboxImage,
  writeSandboxFile,
  runPreviewFinalize,
};
