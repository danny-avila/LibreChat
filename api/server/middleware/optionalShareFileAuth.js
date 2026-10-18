const cookie = require('cookie');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  createOptionalShareFileAuth,
  clearCloudFrontCookies,
  isTwoFactorEnrollmentRequired,
  isTokenRetired,
  isEnabled,
} = require('@librechat/api');
const { getAuthUserById, findAuthSession } = require('~/server/services/AuthSessions');

module.exports = createOptionalShareFileAuth({
  parseCookie: cookie.parse,
  getUserById: getAuthUserById,
  findSession: findAuthSession,
  runAsSystem,
  clearCloudFrontCookies,
  enrollmentRequired: isTwoFactorEnrollmentRequired,
  tokenRetired: isTokenRetired,
  enabled: isEnabled,
  warn: (...args) => logger.warn(...args),
});
