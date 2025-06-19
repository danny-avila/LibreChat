const express = require('express');
const {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  fetchModelsForProvider,
} = require('~/server/controllers/ProviderController');
const { requireJwtAuth, requireAdminAuth } = require('~/server/middleware'); // Assuming requireAdminAuth middleware exists or will be created

const router = express.Router();

// Apply admin authentication middleware to all routes in this file
// router.use(requireAdminAuth); // Uncomment when admin auth is ready

router.get('/', requireJwtAuth, getProviders); // requireJwtAuth for now, can be requireAdminAuth
router.post('/', requireJwtAuth, createProvider); // requireJwtAuth for now, can be requireAdminAuth
router.put('/:providerId', requireJwtAuth, updateProvider); // requireJwtAuth for now, can be requireAdminAuth
router.delete('/:providerId', requireJwtAuth, deleteProvider); // requireJwtAuth for now, can be requireAdminAuth
router.post('/:providerId/fetch-models', requireJwtAuth, fetchModelsForProvider); // requireJwtAuth for now

module.exports = router;
