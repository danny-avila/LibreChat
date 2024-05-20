const multer = require('multer');
const express = require('express');
const {
  getVoices,
  streamAudio,
  // textToSpeech,
  // streamAudioFromWebSocket,
} = require('~/server/services/Files/Audio');
const { requireJwtAuth } = require('~/server/middleware/');
const { Message } = require('~/models/Message');
const router = express.Router();

const upload = multer();

// router.use(requireJwtAuth);

// router.post('/', upload.none(), async (req, res) => {
//   const { websocket } = req.body;
//   if (websocket) {
//     streamAudioFromWebSocket(req, res);
//   } else {
//     await textToSpeech(req, res);
//   }
// });

router.post('/', async (req, res) => {
  try {
    console.log('start stream audio');
    await streamAudio(req, res);
    console.log('end stream audio');
  } catch (error) {
    console.error('Failed to stream audio:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
