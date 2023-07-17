const { logoutUser } = require('../../services/auth.service');

const logoutController = async (req, res) => {
  const { signedCookies = {} } = req;
  const { refreshToken } = signedCookies;
  try {
    const logout = await logoutUser(req.user._id, refreshToken);
    const { status, message } = logout;
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    return res.status(status).send({ message });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  logoutController,
};
