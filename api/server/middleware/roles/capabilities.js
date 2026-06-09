const {
  generateCapabilityCheck,
  generatePlatformAdminCheck,
  capabilityContextMiddleware,
} = require('@librechat/api');
const { getUserPrincipals, hasCapabilityForPrincipals } = require('~/models');

const { hasCapability, requireCapability, hasConfigCapability, superAdminContextMiddleware } =
  generateCapabilityCheck({
    getUserPrincipals,
    hasCapabilityForPrincipals,
  });

const { isPlatformAdmin, requirePlatformAdmin } = generatePlatformAdminCheck({
  getUserPrincipals,
  hasCapabilityForPrincipals,
});

module.exports = {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  superAdminContextMiddleware,
  capabilityContextMiddleware,
  isPlatformAdmin,
  requirePlatformAdmin,
};
