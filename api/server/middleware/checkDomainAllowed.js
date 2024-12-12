const { isEmailDomainAllowed } = require('~/server/services/domains');
const { logger } = require('~/config');

/**
 * Checks the domain's social login is allowed
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Next middleware function.
 *
 * @returns {Promise<function|Object>} - Returns a Promise which when resolved calls next middleware if the domain's email is allowed
 */
const checkDomainAllowed = async (req, res, next = () => {}) => {
  const email = req?.user?.email;
  if (email && !(await isEmailDomainAllowed(email))) {
    logger.error(`[Social Login] [Social Login not allowed] [Email: ${email}]`);
    return res.redirect('/login');
  } else {
    return next();
  }
};

module.exports = checkDomainAllowed;
