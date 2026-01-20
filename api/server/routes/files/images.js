const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { isAgentsEndpoint } = require('librechat-data-provider');
const {
  filterFile,
  processImageFile,
  processAgentFileUpload,
} = require('~/server/services/Files/process');

const router = express.Router();

const FILE_SEARCH_IMAGE_UNSUPPORTED =
  'Image uploads are not supported for file search tool resources';

router.post('/', async (req, res) => {
  const metadata = req.body;
  const appConfig = req.config;

  try {
    filterFile({ req, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    if (isAgentsEndpoint(metadata.endpoint) && metadata.tool_resource != null) {
      return await processAgentFileUpload({ req, res, metadata });
    }

    await processImageFile({ req, res, metadata });
  } catch (error) {
    // TODO: delete remote file if it exists
    /**
     * Expected case: users may attempt to attach images for File Search tool resources,
     * which is not supported. This should not be logged as an error.
     */
    if (error?.message?.includes(FILE_SEARCH_IMAGE_UNSUPPORTED)) {
      logger.debug(`[/files/images] ${FILE_SEARCH_IMAGE_UNSUPPORTED}`);
    } else {
      logger.error('[/files/images] Error processing file:', error);
    }

    let message = 'Error processing file';

    if (
      error.message?.includes('Invalid file format') ||
      error.message?.includes(FILE_SEARCH_IMAGE_UNSUPPORTED) ||
      error.message?.includes('No OCR result') ||
      error.message?.includes('exceeds token limit')
    ) {
      message = error.message;
    }

    try {
      const filepath = path.join(
        appConfig.paths.imageOutput,
        req.user.id,
        path.basename(req.file.filename),
      );
      await fs.unlink(filepath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        logger.debug('[/files/images] Output image file already deleted');
      } else {
        logger.error('[/files/images] Error deleting file:', error);
      }
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
