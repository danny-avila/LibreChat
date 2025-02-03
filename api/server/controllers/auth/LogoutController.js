const cookies = require('cookie');
const { Issuer } = require('openid-client');
const { logoutUser } = require('~/server/services/AuthService');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const logoutController = async (req, res) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  try {
    const logout = await logoutUser(req, refreshToken);
    const { status, message } = logout;
    res.clearCookie('refreshToken');
    const response = { message };
    if (
      req.user.openidId != null &&
      isEnabled(process.env.OPENID_USE_END_SESSION_ENDPOINT) &&
      process.env.OPENID_ISSUER
    ) {
      const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
      const redirect = issuer.end_session_endpoint;
      if (!redirect) {
        logger.warn(
          '[logoutController] end_session_endpoint not found in OpenID issuer metadata. Please verify that the issuer is correct.',
        );
      } else {
        response.redirect = redirect;
      }
    }
    return res.status(status).send(response);
  } catch (err) {
    logger.error('[logoutController]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  logoutController,
};
