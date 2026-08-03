const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  shouldUseUploadSse,
  startUploadSseStream,
  resolveUploadErrorMessage,
  verifyAgentUploadPermission,
} = require('@librechat/api');
const { isAssistantsEndpoint } = require('librechat-data-provider');
const {
  processAgentFileUpload,
  processImageFile,
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
    filterFile({ req, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    if (!isAssistantsEndpoint(metadata.endpoint) && metadata.tool_resource != null) {
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
    logger.error('[/files/images] Error processing file:', error);

    const message = resolveUploadErrorMessage(error);

    try {
      const filepath = path.join(
        appConfig.paths.imageOutput,
        req.user.id,
        path.basename(req.file.filename),
      );
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
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
