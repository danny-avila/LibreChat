const multer = require('multer');
const express = require('express');
const Bottleneck = require('bottleneck');
const { CacheKeys } = require('librechat-data-provider');
const { getVoices, streamAudio, textToSpeech } = require('~/server/services/Files/Audio');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

const router = express.Router();
const upload = multer();

// todo: can add Redis support for limiter
const limiter = new Bottleneck({
  minTime: 240, // Minimum time between requests (240ms per request = 250 requests per minute)
  maxConcurrent: 100, // Maximum number of concurrent requests
  reservoir: 250, // Initial number of available requests
  reservoirRefreshAmount: 250, // Number of requests replenished in each interval
  reservoirRefreshInterval: 60 * 1000, // Reservoir refresh interval (60 seconds)
});

const limitedStreamAudio = limiter.wrap(streamAudio);
const limitedTextToSpeech = limiter.wrap(textToSpeech);

router.post('/manual', upload.none(), async (req, res) => {
  try {
    await limitedTextToSpeech(req, res);
  } catch (error) {
    logger.error(`[textToSpeech] user: ${req.user.id} | Failed to process textToSpeech: ${error}`);
    res.status(500).json({ error: 'Failed to process textToSpeech' });
  }
});

const logDebugMessage = (req, message) =>
  logger.debug(`[streamAudio] user: ${req?.user?.id ?? 'UNDEFINED_USER'} | ${message}`);

// TODO: test caching
router.post('/', async (req, res) => {
  try {
    const audioRunsCache = getLogStores(CacheKeys.AUDIO_RUNS);
    const audioRun = await audioRunsCache.get(req.body.runId);
    logDebugMessage(req, 'start stream audio');
    if (audioRun) {
      logDebugMessage(req, 'stream audio already running');
      return res.status(401).json({ error: 'Audio stream already running' });
    }
    audioRunsCache.set(req.body.runId, true);
    await limitedStreamAudio(req, res);
    logDebugMessage(req, 'end stream audio');
    res.status(200).end();
  } catch (error) {
    logger.error(`[streamAudio] user: ${req.user.id} | Failed to stream audio: ${error}`);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// todo: cache voices
router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
