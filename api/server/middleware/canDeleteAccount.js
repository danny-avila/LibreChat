const { isEnabled } = require('@librechat/api');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability } = require('~/server/middleware/roles/capabilities');

/**
 * Checks if the user can delete their account
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @returns {Promise<function|Object>} - Returns a Promise which when resolved calls next middleware if the user can delete their account
 */

const canDeleteAccount = async (req, res, next = () => {}) => {
  const { user } = req;
  const { ALLOW_ACCOUNT_DELETION = true } = process.env;
  if (isEnabled(ALLOW_ACCOUNT_DELETION)) {
    return next();
  }
  let hasAdminAccess = false;
  if (user) {
    try {
      const id = user.id ?? user._id?.toString();
      if (id) {
        hasAdminAccess = await hasCapability(
          { id, role: user.role ?? '', tenantId: user.tenantId },
          SystemCapabilities.ACCESS_ADMIN,
        );
      }
    } catch (err) {
      logger.warn(`[canDeleteAccount] capability check failed, denying: ${err.message}`);
    }
  }
  if (hasAdminAccess) {
    logger.debug(`[canDeleteAccount] ACCESS_ADMIN bypass for user ${user.id}`);
    return next();
  }
  logger.error(`[User] [Delete Account] [User cannot delete account] [User: ${user?.id}]`);
  return res.status(403).send({ message: 'You do not have permission to delete this account' });
};

module.exports = canDeleteAccount;
