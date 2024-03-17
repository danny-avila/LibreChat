const express = require('express');
const multer = require('multer');
const upload = multer();
const router = express.Router();
const { setCurrentUser, requireSubscription } = require('~/server/middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const OpenAI = require('openai');
const { toFile } = require('openai/uploads');
const { getUserKey } = require('../services/UserService');
const { getOneMessage } = require('~/models');

const setTokenFromParams = async (req, res, next) => {
  const { token } = req.query;
  if (token) {
    req.headers['authorization'] = `Bearer ${token}`;
  }
  next();
};

router.use(setTokenFromParams, ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);

router.post('/stt', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: 'no voice file provided' });
  }
  try {
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'user_provided') {
      const keyRes = await getUserKey({ userId: req.user.id, name: 'openAI' });
      const { apiKey: key } = JSON.parse(keyRes);
      apiKey = key;
    }

    const openai = new OpenAI({ apiKey });
    const file = await toFile(Buffer.from(req.file.buffer), 'audio.webm', {
      type: 'audio/webm;codecs=opus',
    });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });
    return res.json(transcription);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

router.get('/tts', async (req, res) => {
  const { messageId } = req.query;
  if (!messageId) {
    return res.status(400).send({ error: 'no voice file provided' });
  }
  const message = await getOneMessage({ messageId, user: req.user.id });
  try {
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'user_provided') {
      const keyRes = await getUserKey({ userId: req.user.id, name: 'openAI' });
      const { apiKey: key } = JSON.parse(keyRes);
      apiKey = key;
    }
    const openai = new OpenAI({ apiKey });
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: message.text,
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    mp3.body.pipe(res);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

module.exports = router;
