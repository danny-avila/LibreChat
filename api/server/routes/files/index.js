const express = require('express');
const {
  createFileUsageLimiter,
  createFileLimiters,
  configMiddleware,
  requireJwtAuth,
  uaParser,
  checkBan,
} = require('~/server/middleware');
const { restoreTenantContextFromReq } = require('@librechat/api');
const { avatar: asstAvatarRouter } = require('~/server/routes/assistants/v1');
const { avatar: agentAvatarRouter } = require('~/server/routes/agents/v1');
const { createMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const speech = require('./speech');

const initialize = async () => {
  const router = express.Router();
  router.use(requireJwtAuth);
  router.use(configMiddleware);
  router.use(checkBan);
  router.use(uaParser);

  const upload = await createMulterInstance();
  router.post('/speech/stt', upload.single('audio'), restoreTenantContextFromReq);

  /* Important: speech route must be added before the upload limiters */
  router.use('/speech', speech);

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
  router.post(
    '/',
    fileUploadIpLimiter,
    fileUploadUserLimiter,
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images',
    fileUploadIpLimiter,
    fileUploadUserLimiter,
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images/avatar',
    fileUploadIpLimiter,
    fileUploadUserLimiter,
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images/agents/:agent_id/avatar',
    fileUploadIpLimiter,
    fileUploadUserLimiter,
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images/assistants/:assistant_id/avatar',
    fileUploadIpLimiter,
    fileUploadUserLimiter,
    upload.single('file'),
    restoreTenantContextFromReq,
  );

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  router.use('/images/agents', agentAvatarRouter);
  router.use('/images/assistants', asstAvatarRouter);
  return router;
};

module.exports = { initialize };
