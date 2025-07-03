const express = require('express');
const { uaParser, checkBan, requireJwtAuth, createFileLimiters } = require('~/server/middleware');
const { avatar: asstAvatarRouter } = require('~/server/routes/assistants/v1');
const { avatar: agentAvatarRouter } = require('~/server/routes/agents/v1');
const { createMulterInstance, createSecureUploadMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const speech = require('./speech');
const downloads = require('./downloads');
const cleanup = require('./cleanup');
const secureUploadRouter = require('./secureUpload');

const initialize = async () => {
  const router = express.Router();

  // Add download routes first (no auth required for token-based downloads)
  router.use('/', downloads);

  // Apply authentication middleware for other routes
  router.use(requireJwtAuth);
  router.use(checkBan);
  router.use(uaParser);

  const upload = await createMulterInstance();
  const secureUploadMulter = await createSecureUploadMulterInstance();
  router.post('/speech/stt', upload.single('audio'));

  /* Important: speech route must be added before the upload limiters */
  router.use('/speech', speech);

  /* Add secure upload route before limiters */
  router.post('/secure-upload', secureUploadMulter.single('file'));

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

  /* Apply rate limiters to specific routes instead of wildcard */
  router.post('/', fileUploadIpLimiter, fileUploadUserLimiter, upload.single('file'));
  router.post('/images', fileUploadIpLimiter, fileUploadUserLimiter, upload.single('file'));
  router.post('/images/avatar', fileUploadIpLimiter, fileUploadUserLimiter, upload.single('file'));
  router.post('/images/agents/:agent_id/avatar', fileUploadIpLimiter, fileUploadUserLimiter, upload.single('file'));
  router.post('/images/assistants/:assistant_id/avatar', fileUploadIpLimiter, fileUploadUserLimiter, upload.single('file'));

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  router.use('/images/agents', agentAvatarRouter);
  router.use('/images/assistants', asstAvatarRouter);
  router.use('/cleanup', cleanup);
  router.use('/secure-upload', secureUploadRouter);

  return router;
};

module.exports = { initialize };
