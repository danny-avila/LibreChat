const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  inspectContent,
  extractFileContent,
  hasActiveFileFieldPolicy,
  contentFilterBlockResponse,
  contentFilterUninspectableResponse,
  getBlockedUninspectableFileField,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const {
  assertSinglePathSegment,
  resolvePathFromTrustedRoot,
} = require('~/server/utils/pathSafety');
const { filterFile } = require('~/server/services/Files/process');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');

const router = express.Router();
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.post('/', fileUploadIpLimiter, fileUploadUserLimiter, async (req, res) => {
  try {
    const appConfig = req.config;
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    const rawUserId = req.user.id;
    if (!rawUserId) {
      throw new Error('User ID is undefined');
    }
    /* Reject unsafe path characters before the user id flows into
     * strategy.processAvatar, which persists it as a storage path segment. */
    const userId = assertSinglePathSegment('userId', rawUserId);
    const tempFilename = assertSinglePathSegment('filename', req.file.filename);
    const tempUploadPath = resolvePathFromTrustedRoot(
      'avatar upload path',
      appConfig.paths.uploads,
      'temp',
      userId,
      tempFilename,
    );
    const { manual } = req.body;
    const input = await fs.readFile(tempUploadPath);

    const fileStrategy = getFileStrategy(appConfig, { isAvatar: true });
    const desiredFormat = appConfig.imageOutputType;
    const resizedBuffer = await resizeAvatar({
      userId,
      input,
      desiredFormat,
    });

    const { processAvatar } = getStrategyFunctions(fileStrategy);
    const url = await processAvatar({
      buffer: resizedBuffer,
      userId,
      manual,
      tenantId: req.user.tenantId,
    });

    res.json({ url });
  } catch (error) {
    const message = 'An error occurred while uploading the profile picture';
    logger.error(message, error);
    res.status(500).json({ message });
  } finally {
    try {
      const safeUserId = assertSinglePathSegment('userId', req.user?.id);
      const safeFilename = assertSinglePathSegment('filename', req.file?.filename);
      const tempUploadPath = resolvePathFromTrustedRoot(
        'avatar upload path',
        req.config.paths.uploads,
        'temp',
        safeUserId,
        safeFilename,
      );
      await fs.unlink(tempUploadPath);
      logger.debug('[/files/images/avatar] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images/avatar] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
