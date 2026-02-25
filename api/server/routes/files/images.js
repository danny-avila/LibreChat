const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { isAssistantsEndpoint } = require('librechat-data-provider');
const {
  processAgentFileUpload,
  processImageFile,
  filterFile,
} = require('~/server/services/Files/process');

const router = express.Router();

const sanitizePathSegment = (value = '') => value.replace(/[^a-zA-Z0-9_-]/g, '');

const createSafeImagePath = (basePath, userId, filename) => {
  const safeUserId = sanitizePathSegment(userId);
  const safeFilename = path.basename(filename);
  const userPath = path.resolve(basePath, safeUserId);
  const filePath = path.resolve(userPath, safeFilename);

  if (!filePath.startsWith(`${userPath}${path.sep}`) && filePath !== userPath) {
    return null;
  }

  return filePath;
};

router.post('/', async (req, res) => {
  const metadata = req.body;
  const appConfig = req.config;

  try {
    filterFile({ req, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    if (!isAssistantsEndpoint(metadata.endpoint) && metadata.tool_resource != null) {
      return await processAgentFileUpload({ req, res, metadata });
    }

    await processImageFile({ req, res, metadata });
  } catch (error) {
    // TODO: delete remote file if it exists
    logger.error('[/files/images] Error processing file:', error);

    let message = 'Error processing file';

    if (
      error.message?.includes('Invalid file format') ||
      error.message?.includes('No OCR result') ||
      error.message?.includes('exceeds token limit')
    ) {
      message = error.message;
    }

    try {
      const filepath = createSafeImagePath(
        appConfig.paths.imageOutput,
        req.user?.id,
        req.file?.filename ?? '',
      );

      if (filepath) {
        await fs.unlink(filepath);
      }
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/files/images] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
