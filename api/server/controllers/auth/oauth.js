const { logger } = require('@librechat/data-schemas');
const { isEnabled } = require('@librechat/api');
const { syncUserEntraGroupMemberships } = require('~/server/services/PermissionService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { sendOpenIDAuthResponse } = require('~/server/services/OpenIDRefreshRecovery');
const { checkBan } = require('~/server/middleware');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

function createOAuthHandler(redirectUri = domains.client) {
  /**
   * A handler to process OAuth authentication results.
   * @type {Function}
   * @param {ServerRequest} req - Express request object.
   * @param {ServerResponse} res - Express response object.
   * @param {NextFunction} next - Express next middleware function.
   */
  return async (req, res, next) => {
    try {
      if (res.headersSent) {
        return;
      }

      await checkBan(req, res);
      if (req.banned) {
        return;
      }

      /** Set the session cookies and redirect */
      if (
        req.user &&
        req.user.provider == 'openid' &&
        isEnabled(process.env.OPENID_REUSE_TOKENS) === true
      ) {
        await syncUserEntraGroupMemberships(req.user, req.user.tokenset.access_token);
        await sendOpenIDAuthResponse({
          tokenset: req.user.tokenset,
          user: req.user,
          existingRefreshToken: req.user.tokenset.refresh_token,
          openidSubject: req.user.openidId,
          openidIssuer: req.user.openidIssuer,
          discardSessionTokens: true,
          req,
          res,
        });
      } else {
        await setAuthTokens(req.user._id, res, null, req);
        if (
          req.user.provider === 'openid' &&
          isEnabled(process.env.OPENID_USE_END_SESSION_ENDPOINT)
        ) {
          req.session.openidLogoutIdToken = req.user.tokenset?.id_token;
        }
      }
      res.redirect(redirectUri);
    } catch (err) {
      logger.error('Error in setting authentication tokens:', err);
      next(err);
    }
  };
}

module.exports = {
  createOAuthHandler,
};
