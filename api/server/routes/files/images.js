const { z } = require('zod');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const outputPath = path.join(req.app.locals.config.imageOutputPath, 'temp');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    cb(null, req.file_id + '-' + file.originalname);
  },
});
const upload = multer({ storage });

const { localStrategy } = require('../../services/Files');

router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  const metadata = req.body;
  // TODO: add file size/type validation

  if (!file) {
    return res.status(400).json({ message: 'No file provided' });
  }

  if (!metadata.file_id) {
    return res.status(400).json({ message: 'No file id provided' });
  }

  if (!metadata.width) {
    return res.status(400).json({ message: 'No width provided' });
  }

  if (!metadata.height) {
    return res.status(400).json({ message: 'No height provided' });
  }

  const uuidSchema = z.string().uuid();

  try {
    /* parse to validate api call */
    uuidSchema.parse(metadata.file_id);
    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;
    await localStrategy({ res, file, metadata });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ message: 'Error processing file' });
  }

  // do this if strategy is not local
  // finally {
  //   try {
  //     // await fs.unlink(file.path);
  //   } catch (error) {
  //     console.error('Error deleting file:', error);

  //   }
  // }
});

module.exports = router;
