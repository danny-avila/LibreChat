const cookies = require('cookie');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { logoutUser } = require('~/server/services/AuthService');
const { getOpenIdConfig } = require('~/strategies');

const logoutController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const isOpenIdUser = req.user?.openidId != null && req.user?.provider === 'openid';

  /** For OpenID users, read tokens from session (with cookie fallback) */
  let refreshToken;
  let idToken;
  if (isOpenIdUser && req.session?.openidTokens) {
    refreshToken = req.session.openidTokens.refreshToken;
    idToken = req.session.openidTokens.idToken;
    delete req.session.openidTokens;
  }
  refreshToken = refreshToken || parsedCookies.refreshToken;
  idToken = idToken || parsedCookies.openid_id_token;

  try {
    const logout = await logoutUser(req, refreshToken);
    const { status, message } = logout;

    res.clearCookie('refreshToken');
    res.clearCookie('openid_access_token');
    res.clearCookie('openid_id_token');
    res.clearCookie('openid_user_id');
    res.clearCookie('token_provider');
    const response = { message };
    if (
      isOpenIdUser &&
      isEnabled(process.env.OPENID_USE_END_SESSION_ENDPOINT) &&
      process.env.OPENID_ISSUER
    ) {
      let openIdConfig;
      try {
        openIdConfig = getOpenIdConfig();
      } catch (err) {
        logger.warn('[logoutController] OpenID config not available:', err.message);
      }
      if (openIdConfig) {
        const endSessionEndpoint = openIdConfig.serverMetadata().end_session_endpoint;
        if (endSessionEndpoint) {
          const endSessionUrl = new URL(endSessionEndpoint);
          /** Redirect back to app's login page after IdP logout */
          const postLogoutRedirectUri =
            process.env.OPENID_POST_LOGOUT_REDIRECT_URI || `${process.env.DOMAIN_CLIENT}/login`;
          endSessionUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

          /** Add id_token_hint (preferred) or client_id for OIDC spec compliance */
          if (idToken) {
            endSessionUrl.searchParams.set('id_token_hint', idToken);
          } else if (process.env.OPENID_CLIENT_ID) {
            endSessionUrl.searchParams.set('client_id', process.env.OPENID_CLIENT_ID);
          } else {
            logger.warn(
              '[logoutController] Neither id_token_hint nor OPENID_CLIENT_ID is available. ' +
                'To enable id_token_hint, set OPENID_REUSE_TOKENS=true. ' +
                'The OIDC end-session request may be rejected by the identity provider.',
            );
          }

          response.redirect = endSessionUrl.toString();
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
