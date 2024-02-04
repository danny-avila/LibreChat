const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const textToSpeechLocal = require('~/server/services/Files/Audio/textToSpeechLocal');
const multer = require('multer');
const upload = multer();

router.post('/', requireJwtAuth, upload.none(), async (req, res) => {
  await textToSpeechLocal(req, res);
});

module.exports = router;
