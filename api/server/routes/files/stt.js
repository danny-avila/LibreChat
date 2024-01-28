const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const multer = require('multer');
const speechToTextLocal = require('~/server/services/Files/Audio/speechToTextLocal');

const upload = multer();

router.post('/', requireJwtAuth, upload.single('audio'), async (req, res) => {
  console.log('Received FormData');

  if (process.env.WHISPER_LOCAL === 'true') {
    await speechToTextLocal(req, res);
  } else {
    console.log('using the whisper api');
  }
});

module.exports = router;
