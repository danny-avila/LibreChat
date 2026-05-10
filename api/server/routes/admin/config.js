const express = require('express');
const { createAdminConfigHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  hasConfigCapability,
  requireCapability,
} = require('~/server/middleware/roles/capabilities');
const { getAppConfig, invalidateConfigCaches } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminConfigHandlers({
  listAllConfigs: db.listAllConfigs,
  findConfigByPrincipal: db.findConfigByPrincipal,
  upsertConfig: db.upsertConfig,
  patchConfigFields: db.patchConfigFields,
  unsetConfigField: db.unsetConfigField,
  deleteConfig: db.deleteConfig,
  toggleConfigActive: db.toggleConfigActive,
  hasConfigCapability,
  getAppConfig,
  invalidateConfigCaches,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.listConfigs);
router.get('/base', handlers.getBaseConfig);
router.get('/:principalType/:principalId', handlers.getConfig);
router.put('/:principalType/:principalId', handlers.upsertConfigOverrides);
router.patch('/:principalType/:principalId/fields', handlers.patchConfigField);
router.delete('/:principalType/:principalId/fields', handlers.deleteConfigField);
router.delete('/:principalType/:principalId', handlers.deleteConfigOverrides);
router.patch('/:principalType/:principalId/active', handlers.toggleConfig);

module.exports = router;
