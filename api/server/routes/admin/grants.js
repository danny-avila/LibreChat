const express = require('express');
const { createAdminGrantsHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminGrantsHandlers({
  getCapabilitiesForPrincipal: db.getCapabilitiesForPrincipal,
  grantCapability: db.grantCapability,
  revokeCapability: db.revokeCapability,
  getUserPrincipals: db.getUserPrincipals,
  hasCapabilityForPrincipals: db.hasCapabilityForPrincipals,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/effective', handlers.getEffectiveCapabilities);
router.get('/:principalType/:principalId', handlers.getPrincipalGrants);
router.post('/', handlers.assignGrant);
router.delete('/', handlers.revokeGrant);

module.exports = router;
