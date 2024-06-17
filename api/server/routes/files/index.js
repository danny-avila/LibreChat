const express = require('express');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  createFileLimiters,
  createTTSLimiters,
  createSTTLimiters,
} = require('~/server/middleware');
const { createMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const stt = require('./stt');
const tts = require('./tts');

const initialize = async () => {
  const router = express.Router();
  router.use(requireJwtAuth);
  router.use(checkBan);
  router.use(uaParser);

  /* Important: stt/tts routes must be added before the upload limiters */
  const { sttIpLimiter, sttUserLimiter } = createSTTLimiters();
  const { ttsIpLimiter, ttsUserLimiter } = createTTSLimiters();
  router.use('/stt', sttIpLimiter, sttUserLimiter, stt);
  router.use('/tts', ttsIpLimiter, ttsUserLimiter, tts);

  const upload = await createMulterInstance();
  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
  router.post('*', fileUploadIpLimiter, fileUploadUserLimiter);
  router.post('/', upload.single('file'));
  router.post('/images', upload.single('file'));

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  return router;
};

module.exports = { initialize };
