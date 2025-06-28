const express = require('express');
const { uaParser, checkBan, requireJwtAuth, createFileLimiters } = require('~/server/middleware');
const { avatar: asstAvatarRouter } = require('~/server/routes/assistants/v1');
const { avatar: agentAvatarRouter } = require('~/server/routes/agents/v1');
const { createMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const speech = require('./speech');
const downloads = require('./downloads');
const cleanup = require('./cleanup');

const initialize = async () => {
  const router = express.Router();

  // Add download routes first (no auth required for token-based downloads)
  router.use('/', downloads);

  // Apply authentication middleware for other routes
  router.use(requireJwtAuth);
  router.use(checkBan);
  router.use(uaParser);

  const upload = await createMulterInstance();
  router.post('/speech/stt', upload.single('audio'));

  /* Important: speech route must be added before the upload limiters */
  router.use('/speech', speech);

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
  router.post('*', fileUploadIpLimiter, fileUploadUserLimiter);
  router.post('/', upload.single('file'));
  router.post('/images', upload.single('file'));
  router.post('/images/avatar', upload.single('file'));
  router.post('/images/agents/:agent_id/avatar', upload.single('file'));
  router.post('/images/assistants/:assistant_id/avatar', upload.single('file'));

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  router.use('/images/agents', agentAvatarRouter);
  router.use('/images/assistants', asstAvatarRouter);
  router.use('/cleanup', cleanup);

  return router;
};

module.exports = { initialize };
