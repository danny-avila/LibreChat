const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const textToSpeech = require('~/server/services/Files/Audio/textToSpeech');
const multer = require('multer');
const upload = multer();

router.post('/', requireJwtAuth, upload.none(), async (req, res) => {
  await textToSpeech(req, res);
});

module.exports = router;
