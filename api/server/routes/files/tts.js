const multer = require('multer');
const express = require('express');
const { getVoices, streamAudio, textToSpeech } = require('~/server/services/Files/Audio');
const { logger } = require('~/config');

const router = express.Router();
const upload = multer();

router.post('/manual', upload.none(), async (req, res) => {
  await textToSpeech(req, res);
});

const logDebugMessage = (req, message) =>
  logger.debug(`[streamAudio] user: ${req?.user?.id ?? 'UNDEFINED_USER'} | ${message}`);

// TODO: cache this with TTL
let runIds = new Set();

router.post('/', async (req, res) => {
  try {
    logDebugMessage(req, 'start stream audio');
    if (runIds.has(req.body.runId)) {
      logDebugMessage(req, 'stream audio already running');
      return;
    }
    runIds.add(req.body.runId);
    await streamAudio(req, res);
    logDebugMessage(req, 'end stream audio');
    res.status(200).end();
  } catch (error) {
    logger.error(`[streamAudio] user: ${req.user.id} | Failed to stream audio: ${error}`);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
