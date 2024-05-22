const multer = require('multer');
const express = require('express');
const { getVoices, streamAudio, textToSpeech } = require('~/server/services/Files/Audio');
// const { requireJwtAuth } = require('~/server/middleware/');
const router = express.Router();

const upload = multer();

// router.use(requireJwtAuth);

router.post('/manual', upload.none(), async (req, res) => {
  await textToSpeech(req, res);
});

let runIds = new Set();
router.post('/', async (req, res) => {
  try {
    console.log('start stream audio');
    if (runIds.has(req.body.runId)) {
      console.log('stream audio already running');
      return;
    }
    runIds.add(req.body.runId);
    await streamAudio(req, res);
    console.log('end stream audio');
    res.status(200).end();
  } catch (error) {
    console.error('Failed to stream audio:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
