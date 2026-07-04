const express = require('express');
const { createAdminLangfuseHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { invalidateConfigCaches } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminLangfuseHandlers({
  findConfigByPrincipal: db.findConfigByPrincipal,
  patchConfigFields: db.patchConfigFields,
  invalidateConfigCaches,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/connection', handlers.getConnection);
router.put('/connection', handlers.updateConnection);
router.post('/connection/test', handlers.testConnection);

module.exports = router;
