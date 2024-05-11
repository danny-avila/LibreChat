const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireJwtAuth } = require('~/server/middleware/');
const { textToSpeech, getVoices } = require('~/server/services/Files/Audio');

const upload = multer();

router.post('/', requireJwtAuth, upload.none(), async (req, res) => {
  await textToSpeech(req, res);
});

router.get('/voices', requireJwtAuth, async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
