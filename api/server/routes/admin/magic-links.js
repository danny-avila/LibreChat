const express = require('express');
const { createMagicLinkHandlers, isEmailDomainAllowed } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createMagicLinkHandlers({
  createMagicLink: db.createMagicLink,
  findMagicLink: db.findMagicLink,
  findMagicLinkById: db.findMagicLinkById,
  updateMagicLink: db.updateMagicLink,
  listMagicLinks: db.listMagicLinks,
  isEmailDomainAllowed: (email) => {
    const appConfig = getAppConfig();
    return isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains);
  },
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.list);
router.post('/', handlers.generate);
router.delete('/:id', handlers.revoke);

module.exports = router;
