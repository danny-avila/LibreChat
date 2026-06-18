const cookies = require('cookie');
const { clearCloudFrontCookies } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { logoutUser } = require('~/server/services/AuthService');

const logoutController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};

  const refreshToken = parsedCookies.refreshToken;

  try {
    const logout = await logoutUser(req, refreshToken);
    const { status, message } = logout;

    res.clearCookie('refreshToken');
    res.clearCookie('openid_access_token');
    res.clearCookie('openid_id_token');
    res.clearCookie('openid_user_id');
    res.clearCookie('token_provider');
    clearCloudFrontCookies(res, {
      userId: req.user?.id ?? req.user?._id?.toString?.(),
      tenantId: req.user?.tenantId,
    });
    return res.status(status).send({ message });
  } catch (err) {
    logger.error('[logoutController]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  logoutController,
};
