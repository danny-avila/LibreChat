const { logger } = require('@librechat/data-schemas');
const { getUserPrincipals, hasCapabilityForPrincipals } = require('~/models');

/**
 * Check whether a user holds a specific system capability.
 * Resolves the user's full principal set (user + role + groups) and
 * queries SystemGrant for a matching grant.
 *
 * @param {object} user - The user object (from req.user)
 * @param {string} user.id - The user's ID
 * @param {string} user.role - The user's system role
 * @param {string} [user.tenantId] - The tenant ID (undefined in single-instance mode)
 * @param {string} capability - The SystemCapability string to check
 * @returns {Promise<boolean>}
 */
async function hasCapability(user, capability) {
  const principals = await getUserPrincipals({ userId: user.id, role: user.role });
  const tenantId = user.tenantId;
  return hasCapabilityForPrincipals({ principals, capability, tenantId });
}

/**
 * Express middleware factory that gates a route behind a system capability.
 * Returns 403 if the user does not hold the capability.
 *
 * @param {string} capability - The SystemCapability string to require
 * @returns {function} Express middleware
 */
function requireCapability(capability) {
  return async (req, res, next) => {
    try {
      if (await hasCapability(req.user, capability)) {
        return next();
      }
      return res.status(403).json({ message: 'Forbidden' });
    } catch (err) {
      logger.error(`[requireCapability] Error checking capability: ${capability}`, err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}

module.exports = { hasCapability, requireCapability };
