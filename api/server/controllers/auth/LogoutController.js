const cookies = require('cookie');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { logoutUser } = require('~/server/services/AuthService');
const { getOpenIdConfig } = require('~/strategies');

const logoutController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const isOpenIdUser = req.user?.openidId != null && req.user?.provider === 'openid';

  /** For OpenID users, read refresh token from session; for others, use cookie */
  let refreshToken;
  if (isOpenIdUser && req.session?.openidTokens) {
    refreshToken = req.session.openidTokens.refreshToken;
    delete req.session.openidTokens;
  }
  refreshToken = refreshToken || parsedCookies.refreshToken;

  try {
    const logout = await logoutUser(req, refreshToken);
    const { status, message } = logout;

    res.clearCookie('refreshToken');
    res.clearCookie('openid_access_token');
    res.clearCookie('token_provider');
    const response = { message };
    if (
      isOpenIdUser &&
      isEnabled(process.env.OPENID_USE_END_SESSION_ENDPOINT) &&
      process.env.OPENID_ISSUER
    ) {
      const openIdConfig = getOpenIdConfig();
      if (!openIdConfig) {
        logger.warn(
          '[logoutController] OpenID config not found. Please verify that the open id configuration and initialization are correct.',
        );
      } else {
        const endSessionEndpoint = openIdConfig
          ? openIdConfig.serverMetadata().end_session_endpoint
          : null;
        if (endSessionEndpoint) {
          response.redirect = endSessionEndpoint;
        } else {
          logger.warn(
            '[logoutController] end_session_endpoint not found in OpenID issuer metadata. Please verify that the issuer is correct.',
          );
        }
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
