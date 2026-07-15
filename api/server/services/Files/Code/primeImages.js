const { logger } = require('@librechat/data-schemas');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');

/**
 * Maximum number of conversation images primed into the code environment per
 * run. Report-style skills use a handful of images; the cap protects against
 * conversations where tools produced dozens of them (e.g. batch detection).
 */
const DEFAULT_IMAGE_LIMIT = 8;

/**
 * Prime the current thread's images (MCP tool results, assistant
 * attachments) into the code environment so code/skills can access them
 * in the sandbox WITHOUT the user manually re-uploading them via
 * "Upload to Code Environment".
 *
 * Only runs when Run Code is enabled (invoked behind the execute_code
 * gate in initialize.js). Idempotent: once a file has
 * `metadata.codeEnvRef` set, the `$exists:false` filter excludes it and
 * the regular `getUserCodeFiles` path picks it up on subsequent turns —
 * no repeated uploads.
 *
 * Files that already have a `codeEnvRef` (manual uploads, code outputs)
 * are untouched — the existing pipeline carries those; this only handles
 * "orphan" image attachments that have no ref yet.
 *
 * @param {object} params
 * @param {import('express').Request & { user: { id: string } }} params.req
 * @param {string[]} params.threadFileIds - file_ids referenced by messages in the thread.
 * @param {(filter: object, sort: object|null, select: object) => Promise<Array>} params.getFiles
 * @param {(data: object) => Promise<object|null>} params.updateFile
 * @param {number} [params.limit=DEFAULT_IMAGE_LIMIT]
 * @returns {Promise<Array>} updated file documents with codeEnvRef set
 *   (empty array when there is nothing to prime or all uploads failed).
 */
async function primeConversationImages({
  req,
  threadFileIds,
  getFiles,
  updateFile,
  limit = DEFAULT_IMAGE_LIMIT,
}) {
  const userId = req?.user?.id;
  if (!userId || !Array.isArray(threadFileIds) || threadFileIds.length === 0) {
    return [];
  }

  let candidates;
  try {
    candidates = await getFiles(
      {
        file_id: { $in: threadFileIds },
        type: { $regex: '^image/' },
        'metadata.codeEnvRef': { $exists: false },
      },
      { createdAt: -1 },
      { text: 0 },
    );
  } catch (error) {
    logger.error('[primeConversationImages] getFiles failed:', error);
    return [];
  }
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const capped = candidates.slice(0, limit);
  if (candidates.length > capped.length) {
    logger.debug(
      `[primeConversationImages] capped ${candidates.length} -> ${capped.length} (limit=${limit})`,
    );
  }

  /* Open streams from storage. Sandbox name = file_id + extension:
   * guaranteed unique (MCP image names already embed the file_id, but
   * code-output names could collide), so matching results after the
   * batch upload is unambiguous. */
  const staged = [];
  for (const file of capped) {
    if (!file.filepath || !file.source) {
      continue;
    }
    let strategy;
    try {
      strategy = getStrategyFunctions(file.source);
    } catch (error) {
      logger.warn(`[primeConversationImages] no strategy for source=${file.source}: ${error.message}`);
      continue;
    }
    if (!strategy?.getDownloadStream) {
      continue;
    }
    const ext = (file.type && file.type.split('/')[1]) || 'bin';
    const sandboxName = `${file.file_id}.${ext}`;
    try {
      const stream = await strategy.getDownloadStream(req, file.filepath);
      staged.push({ file, stream, filename: sandboxName });
    } catch (error) {
      logger.warn(`[primeConversationImages] stream failed for ${file.file_id}: ${error.message}`);
    }
  }
  if (staged.length === 0) {
    return [];
  }

  let uploaded;
  try {
    uploaded = await batchUploadCodeEnvFiles({
      req,
      files: staged.map((s) => ({ stream: s.stream, filename: s.filename })),
      kind: 'user',
      id: userId,
    });
  } catch (error) {
    logger.error('[primeConversationImages] batch upload failed:', error);
    return [];
  }

  const byName = new Map((uploaded.files || []).map((f) => [f.filename, f.fileId]));
  const primed = [];
  for (const s of staged) {
    const fileId = byName.get(s.filename);
    if (!fileId) {
      continue;
    }
    const codeEnvRef = {
      kind: 'user',
      id: userId,
      storage_session_id: uploaded.storage_session_id,
      file_id: fileId,
    };
    const metadata = { ...(s.file.metadata || {}), codeEnvRef };
    try {
      await updateFile({ file_id: s.file.file_id, metadata });
    } catch (error) {
      logger.warn(`[primeConversationImages] updateFile failed for ${s.file.file_id}: ${error.message}`);
      continue;
    }
    primed.push({ ...(s.file.toObject ? s.file.toObject() : s.file), metadata });
  }

  if (primed.length > 0) {
    logger.debug(
      `[primeConversationImages] primed ${primed.length} image(s) into code env (session=${uploaded.storage_session_id})`,
    );
  }
  return primed;
}

module.exports = { primeConversationImages, DEFAULT_IMAGE_LIMIT };
