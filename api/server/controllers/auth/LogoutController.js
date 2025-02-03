const cookies = require('cookie');
const { logoutUser } = require('~/server/services/AuthService');
const { logger } = require('~/config');
const { Issuer } = require('openid-client');

const logoutController = async (req, res) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  try {
    const idToken = req.session?.idToken;
    const logout = await logoutUser(req, refreshToken);
    const { status, message } = logout;
    res.clearCookie('refreshToken');

    if (process.env.OPENID_END_SESSION_ENDPOINT_ENABLED) {
      await handleOpenIDLogout(idToken, res);
    }

    return res.status(status).send({ message });
  } catch (err) {
    logger.error('[logoutController]', err);
    return res.status(500).json({ message: err.message });
  }
};

const handleOpenIDLogout = async (idToken, res) => {
  try {
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    const logoutEndpoint = issuer.metadata.end_session_endpoint;

    if (!logoutEndpoint) {return;}

    const logoutUrl = new URL(logoutEndpoint);
    if (idToken) {
      logoutUrl.searchParams.append('id_token_hint', idToken);
    }

    logger.info(`[handleOpenIDLogout] Redirecting to: ${logoutUrl.toString()}`);
    return res.redirect(302, logoutUrl.toString());
  } catch (err) {
    logger.error(`[handleOpenIDLogout] OpenID logout failed: ${err.message}`);
  }
};

module.exports = {
  logoutController,
};
