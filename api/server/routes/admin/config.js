const express = require('express');
const { createAdminConfigHandlers, rejectUnsafeConfigKeys } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  hasAnyConfigReadAccess,
  getReadableConfigSections,
} = require('~/server/middleware/roles/capabilities');
const {
  getAppConfig,
  overrideCacheTtl,
  invalidateConfigCaches,
} = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminConfigHandlers({
  listAllConfigs: db.listAllConfigs,
  findConfigByPrincipal: db.findConfigByPrincipal,
  writeConfigDocument: db.writeConfigDocument,
  unsetConfigField: db.unsetConfigField,
  deleteConfig: db.deleteConfig,
  toggleConfigActiveTracked: db.toggleConfigActiveTracked,
  setConfigPriority: db.setConfigPriority,
  principalExists: db.principalExists,
  hasAnyConfigReadAccess,
  getReadableConfigSections,
  hasConfigCapability,
  hasCapability,
  getAppConfig,
  invalidateConfigCaches,
  recordAuditEntry: db.recordAuditEntry,
  auditFailClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
  overrideCacheTtlMs: overrideCacheTtl,
  overrideEnvAllowlist: process.env.CONFIG_OVERRIDE_ENV_ALLOWLIST,
});

router.use(requireJwtAuth, requireAdminAccess, rejectUnsafeConfigKeys);

router.get('/', handlers.listConfigs);
router.get('/meta', handlers.getConfigMeta);
router.get('/base', handlers.getBaseConfig);
router.get('/:principalType/:principalId', handlers.getConfig);
router.put('/:principalType/:principalId', handlers.upsertConfigOverrides);
router.patch('/:principalType/:principalId/fields', handlers.patchConfigField);
router.post('/:principalType/:principalId/fields/tombstone', handlers.tombstoneConfigField);
router.delete('/:principalType/:principalId/fields', handlers.deleteConfigField);
router.post('/:principalType/:principalId/changes', handlers.applyConfigChanges);
router.delete('/:principalType/:principalId', handlers.deleteConfigOverrides);
router.patch('/:principalType/:principalId/active', handlers.toggleConfig);
router.patch('/:principalType/:principalId/priority', handlers.updateConfigPriority);

module.exports = router;
