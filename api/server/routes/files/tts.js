const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const textToSpeechLocal = require('~/server/services/Files/Audio/textToSpeechLocal');

router.post('/', requireJwtAuth, async (req, res) => {
  console.log('Received FormData');

  await textToSpeechLocal(req, res);
});

module.exports = router;
