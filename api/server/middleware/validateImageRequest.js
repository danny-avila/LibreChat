const cookie = require('cookie');
const { createImageAuthorizationMiddleware, getBasePath, isEnabled } = require('@librechat/api');
const {
  findSession,
  getAgent,
  getAssistant,
  getUserById,
  getUserPrincipals,
  hasCapabilityForPrincipals,
  hasPermission,
} = require('~/models');

/**
 * Thin Express adapter for the typed image-authorization service in `@librechat/api`.
 * @param {boolean | {secureImageLinks?: boolean, assistantEndpoints?: object[]}} [config]
 */
function createValidateImageRequest(config = {}) {
  const options =
    typeof config === 'boolean'
      ? { secureImageLinks: config }
      : {
          secureImageLinks: config.secureImageLinks,
          assistantEndpoints: config.assistantEndpoints,
        };

  return createImageAuthorizationMiddleware(options, {
    parseCookies: cookie.parse,
    isOpenIdReuseEnabled: () => isEnabled(process.env.OPENID_REUSE_TOKENS),
    getBasePath,
    findSession,
    getAgent,
    getAssistant,
    getUserById,
    getUserPrincipals,
    hasCapabilityForPrincipals,
    hasPermission,
  });
}

module.exports = createValidateImageRequest;
