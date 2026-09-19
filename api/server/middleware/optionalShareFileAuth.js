const cookie = require('cookie');
const { createOptionalCookieAuth, isEnabled } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { getUserById, findSession } = require('~/models');

module.exports = createOptionalCookieAuth({
  parseCookies: cookie.parse,
  isOpenIdReuseEnabled: () => isEnabled(process.env.OPENID_REUSE_TOKENS),
  getSecret: () => process.env.JWT_REFRESH_SECRET,
  findSession,
  getUserById,
  asSystem: runAsSystem,
  log: logger.warn.bind(logger),
});
