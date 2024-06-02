const User = require('~/models/User');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');
const { isEnabled } = require('~/server/utils');

const loginController = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // If user doesn't exist, return error
    if (!user) {
      // typeof user !== User) { // this doesn't seem to resolve the User type ??
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.emailVerified && !isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN)) {
      return res.status(422).json({ message: 'Email not verified' });
    }

    const token = await setAuthTokens(user._id, res);

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);
  }

  // Generic error messages are safer
  return res.status(500).json({ message: 'Something went wrong' });
};

module.exports = {
  loginController,
};
