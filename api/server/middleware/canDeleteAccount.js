const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

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
  if (user?.role === 'ADMIN' || isEnabled(ALLOW_ACCOUNT_DELETION)) {
    return next();
  } else {
    logger.error(`[User] [Delete Account] [User cannot delete account] [User: ${user?.id}]`);
    return res.status(403).send({ message: 'You do not have permission to delete this account' });
  }
};

module.exports = canDeleteAccount;
