const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { filterFile, processImageFile } = require('~/server/services/Files/process');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', async (req, res) => {
  const metadata = req.body;

  try {
    filterFile({ req, file: req.file, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    await processImageFile({ req, res, file: req.file, metadata });
  } catch (error) {
    // TODO: delete remote file if it exists
    logger.error('[/files/images] Error processing file:', error);
    try {
      const filepath = path.join(
        req.app.locals.paths.imageOutput,
        req.user.id,
        path.basename(req.file.filename),
      );
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message: 'Error processing file' });
  }
});

module.exports = router;
