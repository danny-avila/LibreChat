const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireJwtAuth } = require('~/server/middleware/');
const {
  textToSpeech,
  getVoices,
  streamAudioFromWebSocket,
} = require('~/server/services/Files/Audio');

const upload = multer();

router.post('/', requireJwtAuth, upload.none(), async (req, res) => {
  const { websocket } = req.body;
  if (websocket) {
    streamAudioFromWebSocket(req, res);
  } else {
    await textToSpeech(req, res);
  }
});

router.get('/voices', requireJwtAuth, async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
