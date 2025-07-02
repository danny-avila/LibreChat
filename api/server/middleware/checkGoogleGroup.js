const { checkGroupMembership } = require('~/strategies/googleStrategy');
const { logger } = require('~/config');

const domains = {
  client: process.env.DOMAIN_CLIENT,
};

/**
 * Middleware to verify Google Workspace Group Membership after authentication.
 * Assumes passport.authenticate has run and populated req.user and req.authInfo.
 * Uses accessToken passed via req.authInfo by the modified googleLogin strategy.
 *
 * @param {import('express').Request} req - Express request object. Expects req.user and req.authInfo.accessToken to be populated.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 */
const verifyGoogleGroupMembership = async (req, res, next) => {
  const { GOOGLE_WORKSPACE_GROUP } = process.env;

  if (!GOOGLE_WORKSPACE_GROUP) {
    return next();
  }

  if (!req.user || !req.authInfo || !req.authInfo.accessToken) {
    logger.error(
      '[verifyGoogleGroupMembership] Missing user or authInfo. Ensure Passport authentication ran correctly.',
    );
    // Redirect to a generic error or login page
    return res.redirect(`${domains.client}/login?error=auth_error`);
  }

  const { email: userEmail } = req.user;
  const { accessToken } = req.authInfo;

  try {
    const isMember = await checkGroupMembership(accessToken, userEmail);

    if (!isMember) {
      logger.warn(
        `[verifyGoogleGroupMembership] User ${userEmail} denied access: not a member of ${GOOGLE_WORKSPACE_GROUP}`,
      );
      return res.redirect(`${domains.client}/login?error=group_access_denied`);
    }

    // User is a member, proceed to the next middleware/handler
    logger.info(
      `[verifyGoogleGroupMembership] User ${userEmail} verified as member of ${GOOGLE_WORKSPACE_GROUP}`,
    );
    return next();
  } catch (error) {
    logger.error('[verifyGoogleGroupMembership] Error during group membership check:', error);
    return res.redirect(`${domains.client}/login?error=internal_error`);
  }
};

module.exports = verifyGoogleGroupMembership;
