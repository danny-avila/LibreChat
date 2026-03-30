const express = require('express');
const { createAdminGrantsHandlers, getCachedPrincipals } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminGrantsHandlers({
  listGrants: db.listGrants,
  countGrants: db.countGrants,
  getCapabilitiesForPrincipal: db.getCapabilitiesForPrincipal,
  getCapabilitiesForPrincipals: db.getCapabilitiesForPrincipals,
  grantCapability: db.grantCapability,
  revokeCapability: db.revokeCapability,
  getUserPrincipals: db.getUserPrincipals,
  hasCapabilityForPrincipals: db.hasCapabilityForPrincipals,
  getCachedPrincipals,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.listGrants);
router.get('/effective', handlers.getEffectiveCapabilities);
router.get('/:principalType/:principalId', handlers.getPrincipalGrants);
router.post('/', handlers.assignGrant);
router.delete('/:principalType/:principalId/:capability', handlers.revokeGrant);

module.exports = router;
