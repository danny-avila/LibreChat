const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById, updateUser } = require('~/models/userMethods');
const { isEnabled, checkEmailConfig } = require('~/server/utils');
const { logger } = require('~/config');

// Unix timestamp for 2024-06-07 15:20:18 Eastern Time
const verificationEnabledTimestamp = 1717788018;

const loginController = async (req, res) => {
  try {
    const user = await getUserById(req.user._id, '-password -__v');

    // If user doesn't exist, return error
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const emailEnabled = checkEmailConfig();
    const userCreatedAtTimestamp = Math.floor(new Date(user.createdAt).getTime() / 1000);

    if (
      !emailEnabled &&
      !user.emailVerified &&
      userCreatedAtTimestamp < verificationEnabledTimestamp
    ) {
      await updateUser(user._id, { emailVerified: true });
      user.emailVerified = true;
    }

    if (!user.emailVerified && !isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN)) {
      return res.status(422).json({ message: 'Email not verified' });
    }

    const token = await setAuthTokens(user._id, res);

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);

    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
