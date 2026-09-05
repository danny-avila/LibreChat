const express = require('express');
const { createAdminLangfuseHandlers, getEffectiveTenantId } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  hasConfigCapability,
  requireCapability,
} = require('~/server/middleware/roles/capabilities');
const { invalidateConfigCaches } = require('~/server/services/Config');
const configMiddleware = require('~/server/middleware/config/app');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

async function requireLangfuseManage(req, res, next) {
  try {
    const id = req.user?.id ?? req.user?._id?.toString();
    if (!id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    // The effective request tenant, not the raw user claim — `updateConnection`
    // writes the config, revision, and epoch under the same value, so checking
    // grants against `req.user.tenantId` could authorize a different tenant
    // than the one written.
    const user = {
      id,
      role: req.user.role ?? '',
      tenantId: getEffectiveTenantId(req),
      idOnTheSource: req.user.idOnTheSource ?? null,
    };
    if (await hasConfigCapability(user, 'langfuse')) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch (_err) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

const handlers = createAdminLangfuseHandlers({
  findConfigByPrincipal: db.findConfigByPrincipal,
  mutateConfigWithRevision: db.mutateConfigWithRevision,
  getMessages: db.getMessages,
  invalidateConfigCaches,
});

// `configMiddleware` runs last so unauthorized callers are rejected before the
// config resolves; credential verification reads the deployment's Langfuse
// headers off `req.config`, so without it proxied hosts reject every request.
router.use(requireJwtAuth, requireAdminAccess, requireLangfuseManage, configMiddleware);

router.get('/connection', handlers.getConnection);
router.get('/connection/session/:conversationId', handlers.getSessionLink);
router.put('/connection', handlers.updateConnection);
router.post('/connection/test', handlers.testConnection);

module.exports = router;
