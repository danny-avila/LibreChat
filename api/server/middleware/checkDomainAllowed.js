const { logger } = require('@librechat/data-schemas');
const { isEmailDomainAllowed } = require('~/server/services/domains');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Checks the domain's social login is allowed
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Next middleware function.
 *
 * @returns {Promise<void>} - Calls next middleware if the domain's email is allowed, otherwise redirects to login
 */
const checkDomainAllowed = async (req, res, next) => {
  try {
    const email = req?.user?.email;
    const appConfig = await getAppConfig({
      role: req?.user?.role,
    });

    if (email && !isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
      logger.error(`[Social Login] [Social Login not allowed] [Email: ${email}]`);
      res.redirect('/login');
      return;
    }

    next();
  } catch (error) {
    logger.error('[checkDomainAllowed] Error checking domain:', error);
    res.redirect('/login');
  }
};

module.exports = checkDomainAllowed;
