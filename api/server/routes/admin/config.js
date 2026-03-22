const express = require('express');
const { createAdminConfigHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  requireCapability,
  hasConfigCapability,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { signalConfigChange } = require('~/server/services/Config/app');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminConfigHandlers({
  listAllConfigs: db.listAllConfigs,
  findConfigByPrincipal: db.findConfigByPrincipal,
  upsertConfig: db.upsertConfig,
  deleteConfig: db.deleteConfig,
  toggleConfigActive: db.toggleConfigActive,
  hasConfigCapability,
  signalConfigChange,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.listConfigs);
router.get('/:principalType/:principalId', handlers.getConfig);
router.put('/:principalType/:principalId', handlers.upsertConfigOverrides);
router.patch('/:principalType/:principalId/fields', handlers.patchConfigField);
router.delete('/:principalType/:principalId/fields', handlers.deleteConfigField);
router.delete('/:principalType/:principalId', handlers.deleteConfigOverrides);
router.patch('/:principalType/:principalId/active', handlers.toggleConfig);

module.exports = router;
