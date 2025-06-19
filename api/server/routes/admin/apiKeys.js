const express = require('express');
const {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} = require('~/server/controllers/ApiKeyController');
const { requireJwtAuth, requireAdminAuth } = require('~/server/middleware'); // Assuming requireAdminAuth

const router = express.Router();

// Apply admin authentication middleware to all routes in this file
// router.use(requireAdminAuth); // Uncomment when admin auth is ready

router.get('/', requireJwtAuth, getApiKeys); // requireJwtAuth for now
router.post('/', requireJwtAuth, createApiKey); // requireJwtAuth for now
router.put('/:apiKeyId', requireJwtAuth, updateApiKey); // requireJwtAuth for now
router.delete('/:apiKeyId', requireJwtAuth, deleteApiKey); // requireJwtAuth for now

module.exports = router;
