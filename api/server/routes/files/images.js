const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  getSafeErrorMetadata,
  shouldUseUploadSse,
  startUploadSseStream,
  sendUploadPolicyError,
  resolveUploadErrorMessage,
  verifyAgentUploadPermission,
  assertUploadContentAllowed,
  hasActiveFilePolicy,
  sanitizeFilename,
} = require('@librechat/api');
const {
  isAssistantsEndpoint,
  hasActivePiiPatterns,
  mergeFileConfig,
} = require('librechat-data-provider');
const {
  processAgentFileUpload,
  processImageFile,
  resolvesToTextDelivery,
  filterFile,
} = require('~/server/services/Files/process');
const { checkPermission } = require('~/server/services/PermissionService');
const db = require('~/models');

const router = express.Router();

router.post('/', async (req, res) => {
  const metadata = req.body;
  const appConfig = req.config;

  /** Opened only once auth/validation has passed, right before the potentially
   * long-running upload processing begins — see `startUploadSseStream`. */
  let sseStream = null;
  const openSseStreamIfRequested = () => {
    if (shouldUseUploadSse(req)) {
      sseStream = startUploadSseStream(res);
    }
  };

  try {
    req.file.originalname = sanitizeFilename(req.file.originalname);
    filterFile({ req, image: true });

    await assertUploadContentAllowed({
      filters: req.config?.filters,
      file: req.file,
      endpoint: metadata.endpoint,
      toolResource: metadata.tool_resource,
      fileConfig: mergeFileConfig(req.config?.fileConfig),
      ocrConfigured: req.config?.ocr != null,
      ragConfigured: !!process.env.RAG_API_URL,
      rawFileMode: 'opaque',
    });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    /* An image the config routes to text delivery has to go through the agent upload
     * path, which extracts and stores the text. The image pipeline would persist the
     * routing without any text, leaving the file out of provider delivery and out of
     * the text context both. */
    const takesAgentUploadPath =
      metadata.tool_resource != null || (await resolvesToTextDelivery({ req, metadata }));

    if (!isAssistantsEndpoint(metadata.endpoint) && takesAgentUploadPath) {
      const denied = await verifyAgentUploadPermission({
        req,
        res,
        metadata,
        getAgent: db.getAgent,
        checkPermission,
      });
      if (denied) {
        return;
      }
      openSseStreamIfRequested();
      return await processAgentFileUpload({ req, res, metadata, sseStream });
    }

    openSseStreamIfRequested();
    await processImageFile({ req, res, metadata, sseStream });
  } catch (error) {
    // TODO: delete remote file if it exists
    logger.error('[/files/images] Error processing file:', getSafeErrorMetadata(error));

    try {
      const filepath = path.join(
        appConfig.paths.imageOutput,
        req.user.id,
        path.basename(req.file.filename),
      );
      await fs.unlink(filepath);
    } catch (cleanupError) {
      logger.error('[/files/images] Error deleting file:', getSafeErrorMetadata(cleanupError));
    }
    if (
      sendUploadPolicyError(res, sseStream, error, {
        tempFileId: metadata.temp_file_id,
        toolResource: metadata.tool_resource,
      })
    ) {
      return;
    }
    const contentProtectionActive =
      hasActiveFilePolicy(req.config?.filters) ||
      hasActivePiiPatterns(req.config?.messageFilter?.pii);
    const message = resolveUploadErrorMessage(
      error,
      'Error processing file',
      contentProtectionActive,
    );
    if (sseStream) {
      sseStream.sendError({
        message,
        code: 500,
        temp_file_id: metadata.temp_file_id,
        tool_resource: metadata.tool_resource,
        display_to_user: true,
      });
    } else {
      res.status(500).json({ message });
    }
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/files/images] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images] Temp. image upload file already deleted');
    }
    if (sseStream) {
      sseStream.close();
    }
  }
});

module.exports = router;
