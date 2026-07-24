const express = require('express');
const multer = require('multer');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { getVoiceInstructForUser, canUserConfigureVoice } = require('~/models');
const { createVoicesHandlers } = require('@librechat/api');

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

// Multer — accept .wav / .mp3 / .m4a audio uploads in memory, max 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(wav|mp3|m4a|ogg|flac)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed (wav, mp3, m4a, ogg, flac)'));
    }
  },
});

const handlers = createVoicesHandlers({
  getVoiceInstructForUser,
  canUserConfigureVoice,
});

router.get('/', handlers.listVoices);
router.get('/config', handlers.listConfigurableVoices);
router.post('/', handlers.createVoice);
router.put('/:name', handlers.updateVoice);
router.delete('/:name', handlers.deleteVoice);
router.get('/:name/audio', handlers.getVoiceAudio);
router.post('/:name/audio', upload.single('audio'), handlers.uploadVoiceAudio);
router.delete('/:name/audio', handlers.deleteVoiceAudio);

module.exports = router;
