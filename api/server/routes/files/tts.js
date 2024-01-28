const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const textToSpeechLocal = require('~/server/services/Files/Audio/textToSpeechLocal');

router.post('/', requireJwtAuth, async (req, res) => {
  console.log('Received FormData');

  const audioBuffer = await textToSpeechLocal(req, res);
  res.send(audioBuffer);
});

module.exports = router;
