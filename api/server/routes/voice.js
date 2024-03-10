const express = require('express');
const multer = require('multer');
const upload = multer();
const router = express.Router();
const { setCurrentUser, requireSubscription } = require('~/server/middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const OpenAI = require('openai');
const { getUserKey } = require('../services/UserService');

router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);

router.post('/stt', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: 'no voice file provided' });
  }
  try {
    const keyRes = await getUserKey({ userId: req.user.id, name: 'openAI' });
    const { apiKey } = JSON.parse(keyRes);
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: req.file,
      model: 'whisper-1',
    });
    // const transcription = {
    //     text: "this is transcription"
    // }

    return res.json(transcription);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

module.exports = router;
