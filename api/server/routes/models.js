const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();
if (process.env.NO_AUTH_MODE === 'true') {
  router.get('/', modelController);
} else {
  router.get('/', requireJwtAuth, modelController);
}

module.exports = router;
