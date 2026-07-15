const express = require('express');
const generatedFiles = require('./generatedFiles');

const initialize = async () => {
  const router = express.Router();
  router.use('/', generatedFiles);
  return router;
};

module.exports = { initialize };
