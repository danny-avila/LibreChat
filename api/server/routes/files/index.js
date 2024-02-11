const express = require('express');

const { uaParser, checkBan, requireJwtAuth, createFileLimiters } = require('~/server/middleware');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');

const initialize = () => {
  const router = express.Router();
  router.use(requireJwtAuth);
  router.use(checkBan);
  router.use(uaParser);

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
  router.post('*', fileUploadIpLimiter, fileUploadUserLimiter);

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  return router;
};

module.exports = { initialize };
