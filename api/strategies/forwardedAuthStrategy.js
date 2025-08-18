const { SystemRoles } = require('librechat-data-provider');
const passportCustom = require('passport-custom');
const { getUserById, updateUser, findUser, createUser, countUsers } = require('~/models');
const { logger } = require('~/config');
const { ensureHardcodedAdminRole } = require('~/server/stripe/hardcodedAdminUtils');

/**
 * Strategy for authentication using forwarded HTTP headers from a reverse proxy
 * @returns {passportCustom.Strategy} A custom Passport.js strategy
 */
const forwardedAuthStrategy = () => {
  return new passportCustom.Strategy(async (req, done) => {
    try {
      // Skip if forward auth is not enabled
      if (process.env.FORWARD_AUTH_ENABLED !== 'true') {
        return done(null, false);
      }

      // Get username header name from environment variable
      const usernameHeader = process.env.FORWARD_AUTH_USERNAME_HEADER;
      const emailHeader = process.env.FORWARD_AUTH_EMAIL_HEADER;

      // Username header is required
      if (!usernameHeader) {
        logger.error('[forwardedAuthStrategy] FORWARD_AUTH_USERNAME_HEADER not configured');
        return done(null, false);
      }

      // Extract username from header
      const username = req.headers[usernameHeader.toLowerCase()];
      if (!username) {
        logger.debug(`[forwardedAuthStrategy] No username found in header ${usernameHeader}`);
        return done(null, false);
      }

      // Extract email from header if configured
      const email = emailHeader ? req.headers[emailHeader.toLowerCase()] : null;

      // Try to find user by email first if email is available
      let user = null;
      if (email) {
        user = await findUser({ email }, '-password -__v -totpSecret');
      }

      // If user not found by email, try to find by username
      if (!user) {
        user = await findUser({ username }, '-password -__v -totpSecret');
      }

      // If user exists, update the provider to forwardedAuth
      if (user) {
        const updates = { provider: 'forwardedAuth' };

        // Update email if it was provided in the header and is different
        if (email && user.email !== email) {
          updates.email = email;
        }

        // Apply updates if there are any changes needed
        if (Object.keys(updates).length > 0) {
          user = await updateUser(user._id, updates);
        }
      } else {
        // User doesn't exist, create a new one
        logger.info(`[forwardedAuthStrategy] Creating new user with username: ${username}`);

        // Check if this is the first user to register
        const isFirstRegisteredUser = (await countUsers()) === 0;

        // Create new user
        const newUserData = {
          provider: 'forwardedAuth',
          username,
          name: username,
          emailVerified: true, // Auto-verify email for forwarded auth
          role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
        };

        // Add email if provided
        if (email) {
          newUserData.email = email;
        }

        const newUserId = await createUser(newUserData);
        user = await getUserById(newUserId, '-password -__v -totpSecret');
      }

      // Add id property for consistency with other auth strategies
      user.id = user._id.toString();

      // <stripe>
      user = ensureHardcodedAdminRole(user);
      // </stripe>
      return done(null, user);
    } catch (err) {
      logger.error('[forwardedAuthStrategy] Error:', err);
      return done(err);
    }
  });
};

module.exports = forwardedAuthStrategy;
