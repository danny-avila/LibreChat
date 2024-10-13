const axios = require('axios');
const cookies = require('cookie');
const { logoutUser } = require('~/server/services/AuthService');
const { logger } = require('~/config');
const { isOpenIDConfigured } = require('~/strategies/validators');

const logoutController = async (req, res) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  try {
    if (isOpenIDConfigured()) {
      const params = new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: process.env.OPENID_CLIENT_ID || '',
        client_secret: process.env.OPENID_CLIENT_SECRET || '',
      });

      await axios.post(
        process.env.OPENID_REVOKATION_ENDPOINT_URI,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    }
    const logout = await logoutUser(req.user._id, refreshToken);
    const { status, message } = logout;
    res.clearCookie('refreshToken');
    return res.status(status).send({ message });
  } catch (err) {
    logger.error('[logoutController]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  logoutController,
};
