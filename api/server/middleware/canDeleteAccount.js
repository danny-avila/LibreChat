const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { SystemCapabilities } = require('@librechat/data-schemas');
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
  let hasManageUsers = false;
  if (user) {
    try {
      hasManageUsers = await hasCapability(user, SystemCapabilities.MANAGE_USERS);
    } catch (err) {
      logger.error('[canDeleteAccount] capability check failed, denying:', err);
    }
  }
  if (hasManageUsers) {
    logger.debug(`[canDeleteAccount] MANAGE_USERS bypass for user ${user.id}`);
    return next();
  }
  logger.error(`[User] [Delete Account] [User cannot delete account] [User: ${user?.id}]`);
  return res.status(403).send({ message: 'You do not have permission to delete this account' });
};

module.exports = canDeleteAccount;
