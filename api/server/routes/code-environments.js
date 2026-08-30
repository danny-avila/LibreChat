const express = require('express');
const mongoose = require('mongoose');
const {
  createCodeEnvironmentRegistry,
  createCodeEnvironmentHttpHandlers,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { getAppConfig } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
const registry = createCodeEnvironmentRegistry(mongoose);
const handlers = createCodeEnvironmentHttpHandlers({ getAppConfig, registry });
const requireCodeEnvironmentManage = requireCapability(SystemCapabilities.MANAGE_CODE_ENVIRONMENTS);

router.use(requireJwtAuth);
router.get('/', handlers.list);
router.post('/', requireCodeEnvironmentManage, handlers.register);

module.exports = router;
