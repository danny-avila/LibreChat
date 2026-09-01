const express = require('express');
const { createCodeEnvironmentHttpHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { codeEnvironmentPairingLimiter } = require('~/server/middleware/limiters/code');
const { getAppConfig, getCodeEnvironmentRegistry } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
let handlers;
function getHandlers() {
  if (handlers == null) {
    handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig,
      registry: getCodeEnvironmentRegistry(),
    });
  }
  return handlers;
}
const requireCodeEnvironmentManage = requireCapability(SystemCapabilities.MANAGE_CODE_ENVIRONMENTS);

router.use(requireJwtAuth);
router.get('/', (req, res, next) => getHandlers().list(req, res, next));
router.post('/pairings', codeEnvironmentPairingLimiter, (req, res, next) =>
  getHandlers().pair(req, res, next),
);
router.post('/', requireCodeEnvironmentManage, (req, res, next) =>
  getHandlers().register(req, res, next),
);

module.exports = router;
