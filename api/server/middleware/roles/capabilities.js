const { generateCapabilityCheck, capabilityContextMiddleware } = require('@librechat/api');
const { getUserPrincipals, hasCapabilityForPrincipals } = require('~/models');

const { hasCapability, requireCapability, hasConfigCapability, superAdminContextMiddleware } =
  generateCapabilityCheck({
    getUserPrincipals,
    hasCapabilityForPrincipals,
  });

module.exports = {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  superAdminContextMiddleware,
  capabilityContextMiddleware,
};
