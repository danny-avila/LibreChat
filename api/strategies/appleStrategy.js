const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { Strategy: AppleStrategy } = require('passport-apple');
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

/**
 * Build the AppleStrategy options. Supports two ways of supplying the .p8
 * signing key, in priority order:
 *
 *   1. APPLE_PRIVATE_KEY      — full key contents pasted into an env var.
 *                               Required for hosts with no secret-file
 *                               mount (e.g. DigitalOcean App Platform,
 *                               Heroku). Marked Encrypted/Secret in the host.
 *   2. APPLE_PRIVATE_KEY_PATH — absolute path to the .p8 on disk. Used for
 *                               local dev and hosts that mount secret files
 *                               (Render Secret Files, AWS task definitions,
 *                               self-managed VPS).
 *
 * The contents form normalizes escaped newlines (\n) because some hosts
 * store multi-line env vars with literal backslash-n sequences. Real
 * newlines pass through unchanged.
 */
const buildAppleStrategyOptions = () => {
  const baseOptions = {
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    callbackURL: `${process.env.DOMAIN_SERVER}${process.env.APPLE_CALLBACK_URL}`,
    keyID: process.env.APPLE_KEY_ID,
    passReqToCallback: false,
  };

  if (process.env.APPLE_PRIVATE_KEY) {
    baseOptions.privateKeyString = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  } else if (process.env.APPLE_PRIVATE_KEY_PATH) {
    baseOptions.privateKeyLocation = process.env.APPLE_PRIVATE_KEY_PATH;
  }

  return baseOptions;
};

module.exports = () => new AppleStrategy(buildAppleStrategyOptions(), appleLogin);
module.exports.buildAppleStrategyOptions = buildAppleStrategyOptions;
