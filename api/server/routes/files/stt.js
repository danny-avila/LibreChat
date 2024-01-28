const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const multer = require('multer');
const { speechToTextLocal, speechToTextWhisper } = require('~/server/services/Files/Audio');

const upload = multer();

router.post('/', requireJwtAuth, upload.single('audio'), async (req, res) => {
  if (process.env.WHISPER_LOCAL === 'true') {
    await speechToTextLocal(req, res);
  } else {
    await speechToTextWhisper(req, res);
  }
});

module.exports = router;
