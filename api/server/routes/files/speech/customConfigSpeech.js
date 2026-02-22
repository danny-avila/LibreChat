const express = require('express');
const router = express.Router();

const { getCustomConfigSpeech } = require('~/server/services/Files/Audio');

router.get('/get', async (req, res) => {
  await getCustomConfigSpeech(req, res);
});

module.exports = router;
