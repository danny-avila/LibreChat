const path = require('path');
const mime = require('mime');
const { v4 } = require('uuid');
const { FileContext, FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createFile } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Persist a Buffer as a LibreChat message attachment and return metadata
 * shaped to drop directly into `responseMessage.attachments` (matches
 * `BaseClient.sendMessage`'s expected shape via `artifactPromises`).
 *
 * Single source of truth for the persist→DB→return pipeline. Used by:
 *   - Skills file fetcher (after downloading bytes from Anthropic Files API)
 *   - [DOCUMENT] block parser (after converting markdown to docx in-memory)
 *
 * Both code paths must produce the same end-state attachment so the
 * downstream UI (inline render, My Files panels, download endpoint) sees
 * the file identically regardless of how it was generated.
 *
 * @param {object} params
 * @param {ServerRequest} params.req         Active request (carries user + fileStrategy).
 * @param {Buffer} params.buffer             Raw bytes to persist.
 * @param {string} params.filename           Display filename (e.g. "worksheet.docx").
 * @param {string} [params.mimeType]         MIME type. Inferred from filename if absent.
 * @param {string} [params.context]          File context tag. Defaults to message_attachment.
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 * @returns {Promise<object | null>}         Attachment metadata, or null on error.
 */
async function saveBufferAsAttachment({
  req,
  buffer,
  filename,
  mimeType,
  context,
  conversationId,
  messageId,
}) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('saveBufferAsAttachment requires a non-empty Buffer');
    }

    const realFilename = filename || 'document';
    const realMimeType =
      mimeType || mime.getType(realFilename) || 'application/octet-stream';

    const fileSource = req.app.locals.fileStrategy;
    const { saveBuffer } = getStrategyFunctions(fileSource);
    if (!saveBuffer) {
      throw new Error(`File strategy "${fileSource}" does not support saveBuffer`);
    }

    const newFileId = v4();
    const ext =
      path.extname(realFilename) || `.${mime.getExtension(realMimeType) ?? 'bin'}`;
    const storedName = `${newFileId}${ext}`;

    let filepath = await saveBuffer({
      userId: req.user.id,
      buffer,
      fileName: storedName,
      basePath: 'documents',
    });

    /* Local strategy quirk: saveLocalBuffer writes the bytes to
     * `paths.uploads/documents/{userId}/{file}` on disk but returns
     * `/documents/{userId}/{file}` as the URL. The download route
     * (getLocalFileStream) only matches paths containing `/uploads/` or
     * `/images/`. Prepend `/uploads` so on-disk and URL line up without
     * modifying core LibreChat code. Same fix as in the Skills path. */
    if (
      fileSource === FileSources.local &&
      typeof filepath === 'string' &&
      !filepath.startsWith('/uploads/') &&
      !filepath.startsWith('/images/')
    ) {
      filepath = `/uploads${filepath}`;
    }

    const now = new Date().toISOString();
    const fileRecord = {
      file_id: newFileId,
      user: req.user.id,
      filename: realFilename,
      filepath,
      bytes: buffer.length,
      type: realMimeType,
      source: fileSource,
      context: context ?? FileContext.message_attachment,
      usage: 1,
      createdAt: now,
      updatedAt: now,
    };

    await createFile(fileRecord, true);

    return Object.assign({}, fileRecord, { messageId, conversationId });
  } catch (error) {
    logger.error('[saveBufferAsAttachment] Failed to save attachment', {
      filename: filename ?? '<no filename>',
      error: error?.message ?? error,
    });
    return null;
  }
}

module.exports = { saveBufferAsAttachment };
