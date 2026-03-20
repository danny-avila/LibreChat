const cookies = require('cookie');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { logoutUser } = require('~/server/services/AuthService');
const { getOpenIdConfig } = require('~/strategies');

const logoutController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const isOpenIdUser = req.user?.openidId != null && req.user?.provider === 'openid';

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
          const postLogoutRedirectUri =
            process.env.OPENID_POST_LOGOUT_REDIRECT_URI || `${process.env.DOMAIN_CLIENT}/login`;
          endSessionUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

          /**
           * OIDC RP-Initiated Logout cascading strategy:
           * 1. id_token_hint (most secure, identifies exact session)
           * 2. logout_hint + client_id (when URL would exceed safe length)
           * 3. client_id only (when no token available)
           *
           * Prevents OpenID errors when tokens contain many groups/claims.
           */
          const rawMaxLogoutUrlLength = process.env.OPENID_MAX_LOGOUT_URL_LENGTH;
          let maxLogoutUrlLength = 2000;
          if (rawMaxLogoutUrlLength != null) {
            const parsedMax = Number.parseInt(rawMaxLogoutUrlLength, 10);
            if (Number.isFinite(parsedMax) && parsedMax > 0) {
              maxLogoutUrlLength = parsedMax;
            } else {
              logger.warn(
                `[logoutController] Invalid OPENID_MAX_LOGOUT_URL_LENGTH value "${rawMaxLogoutUrlLength}", using default ${maxLogoutUrlLength}`,
              );
            }
          }
          let useIdTokenHint = false;
          let urlTooLong = false;

          if (idToken) {
            endSessionUrl.searchParams.set('id_token_hint', idToken);
            const urlWithToken = endSessionUrl.toString();

            if (urlWithToken.length > maxLogoutUrlLength) {
              urlTooLong = true;
              logger.debug(
                `[logoutController] Logout URL too long (${urlWithToken.length} chars), ` +
                  'switching to logout_hint strategy',
              );
              endSessionUrl.searchParams.delete('id_token_hint');
            } else {
              useIdTokenHint = true;
            }
          }

          if (!useIdTokenHint) {
            if (urlTooLong) {
              const logoutHint = req.user?.email || req.user?.username || req.user?.openidId;
              if (logoutHint) {
                endSessionUrl.searchParams.set('logout_hint', logoutHint);
                logger.debug('[logoutController] Using logout_hint for user identification');
              }
            }

            if (process.env.OPENID_CLIENT_ID) {
              endSessionUrl.searchParams.set('client_id', process.env.OPENID_CLIENT_ID);
            } else {
              logger.warn(
                '[logoutController] Neither id_token_hint nor OPENID_CLIENT_ID is available. ' +
                  'To enable id_token_hint, set OPENID_REUSE_TOKENS=true. ' +
                  'The OIDC end-session request may be rejected by the identity provider.',
              );
            }
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
