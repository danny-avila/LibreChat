const express = require('express');
const createMulterInstance = require('./multer');
const {
  uaParser,
  checkBan,
  setCurrentUser,
  requireSubscription,
  createFileLimiters,
} = require('~/server/middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');

const initialize = async () => {
  const router = express.Router();
  router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
  router.use(checkBan);
  router.use(uaParser);

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
