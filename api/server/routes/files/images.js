const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { filterFile, processImageUpload } = require('~/server/services/Files/process');
const { logger } = require('~/config');
const upload = require('./multer');

const router = express.Router();

router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  const metadata = req.body;

  try {
    filterFile({ req, file, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    await processImageUpload({ req, res, file, metadata });
  } catch (error) {
    // TODO: delete remote file if it exists
    logger.error('[/files/images] Error processing file:', error);
    try {
      const filepath = path.join(
        req.app.locals.paths.imageOutput,
        req.user.id,
        path.basename(file.filename),
      );
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message: 'Error processing file' });
  }
});

module.exports = router;
