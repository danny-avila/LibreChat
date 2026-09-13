const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { Strategy: AppleStrategy } = require('passport-apple');
const { createOAuthStateStore } = require('@librechat/api');
const socialLogin = require('./socialLogin');

/**
 * Extract profile details from the decoded idToken
 * @param {Object} params - Parameters from the verify callback
 * @param {string} params.idToken - The ID token received from Apple
 * @param {Object} params.profile - The profile object (may contain partial info)
 * @returns {Object} - The extracted user profile details
 */
const getProfileDetails = ({ idToken, profile }) => {
  if (!idToken) {
    logger.error('idToken is missing');
    throw new Error('idToken is missing');
  }

  const decoded = jwt.decode(idToken);

  logger.debug(`Decoded Apple JWT: ${JSON.stringify(decoded, null, 2)}`);

  return {
    email: decoded.email,
    id: decoded.sub,
    avatarUrl: null, // Apple does not provide an avatar URL
    username: decoded.email ? decoded.email.split('@')[0].toLowerCase() : `user_${decoded.sub}`,
    name: decoded.name
      ? `${decoded.name.firstName} ${decoded.name.lastName}`
      : profile.displayName || null,
    emailVerified: true, // Apple verifies the email
  };
};

// Initialize the social login handler for Apple
const appleLogin = socialLogin('apple', getProfileDetails);
const appleAdminLogin = socialLogin('apple', getProfileDetails, { existingUsersOnly: true });

const getAppleConfig = (callbackURL) => ({
  clientID: process.env.APPLE_CLIENT_ID,
  teamID: process.env.APPLE_TEAM_ID,
  callbackURL,
  keyID: process.env.APPLE_KEY_ID,
  privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
  passReqToCallback: false,
});

/**
 * passport-apple fills in a `state` of its own (on the shared route options, so it never changes
 * after the first request), and a preset `state` bypasses the configured state store.
 */
class AppleStoreStateStrategy extends AppleStrategy {
  authorizationParams(options) {
    const { state: _state, ...params } = super.authorizationParams({ ...options });
    return params;
  }
}

/** Apple returns with a cross-site form POST, so its state cookie must be `SameSite=None`. */
const appleStrategy = () => {
  const callbackURL = `${process.env.DOMAIN_SERVER}${process.env.APPLE_CALLBACK_URL}`;
  return new AppleStoreStateStrategy(
    {
      ...getAppleConfig(callbackURL),
      store: createOAuthStateStore({ provider: 'apple', callbackURL, crossSiteCallback: true }),
    },
    appleLogin,
  );
};

const appleAdminStrategy = () =>
  new AppleStrategy(
    getAppleConfig(`${process.env.DOMAIN_SERVER}/api/admin/oauth/apple/callback`),
    appleAdminLogin,
  );

module.exports = appleStrategy;
module.exports.appleAdminLogin = appleAdminStrategy;
