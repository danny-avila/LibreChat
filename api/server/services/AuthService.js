const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { registerSchema, errorsToString } = require('~/strategies/validators');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const Token = require('~/models/schema/tokenSchema');
const { sendEmail } = require('~/server/utils');
const Session = require('~/models/Session');
const { logger } = require('~/config');
const User = require('~/models/User');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

async function isDomainAllowed(email) {
  if (!email) {
    return false;
  }

  const domain = email.split('@')[1];

  if (!domain) {
    return false;
  }

  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return true;
  } else if (!customConfig?.registration?.allowedDomains) {
    return true;
  }

  return customConfig.registration.allowedDomains.includes(domain);
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Logout user
 *
 * @param {String} userId
 * @param {*} refreshToken
 * @returns
 */
const logoutUser = async (userId, refreshToken) => {
  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find the session with the matching user and refreshTokenHash
    const session = await Session.findOne({ user: userId, refreshTokenHash: hash });
    if (session) {
      try {
        await Session.deleteOne({ _id: session._id });
      } catch (deleteErr) {
        logger.error('[logoutUser] Failed to delete session.', deleteErr);
        return { status: 500, message: 'Failed to delete session.' };
      }
    }

    return { status: 200, message: 'Logout successful' };
  } catch (err) {
    return { status: 500, message: err.message };
  }
};

/**
 * Register a new user
 *
 * @param {Object} user <email, password, name, username>
 * @returns
 */
const registerUser = async (user) => {
  const { error } = registerSchema.safeParse(user);
  if (error) {
    const errorMessage = errorsToString(error.errors);
    logger.info(
      'Route: register - Validation Error',
      { name: 'Request params:', value: user },
      { name: 'Validation error:', value: errorMessage },
    );

    return { status: 422, message: errorMessage };
  }

  const { email, password, name, username } = user;

  try {
    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      logger.info(
        'Register User - Email in use',
        { name: 'Request params:', value: user },
        { name: 'Existing user:', value: existingUser },
      );

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: We should change the process to always email and be generic is signup works or fails (user enum)
      return { status: 500, message: 'Something went wrong' };
    }

    if (!(await isDomainAllowed(email))) {
      const errorMessage = 'Registration from this domain is not allowed.';
      logger.error(`[registerUser] [Registration not allowed] [Email: ${user.email}]`);
      return { status: 403, message: errorMessage };
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = (await User.countDocuments({})) === 0;

    const newUser = await new User({
      provider: 'local',
      email,
      password,
      username,
      name,
      avatar: null,
      role: isFirstRegisteredUser ? 'ADMIN' : 'USER',
    });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newUser.password, salt);
    newUser.password = hash;
    await newUser.save();

    return { status: 200, user: newUser };
  } catch (err) {
    return { status: 500, message: err?.message || 'Something went wrong' };
  }
};

/**
 * Request password reset
 *
 * @param {String} email
 * @returns
 */
const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return new Error('Email does not exist');
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  let resetToken = crypto.randomBytes(32).toString('hex');
  const hash = bcrypt.hashSync(resetToken, 10);

  await new Token({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
  }).save();

  const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

  const emailEnabled =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM;

  if (emailEnabled) {
    sendEmail(
      user.email,
      'Password Reset Request',
      {
        name: user.name,
        link: link,
      },
      'requestPasswordReset.handlebars',
    );
    return { link: '' };
  } else {
    return { link };
  }
};

/**
 * Reset Password
 *
 * @param {*} userId
 * @param {String} token
 * @param {String} password
 * @returns
 */
const resetPassword = async (userId, token, password) => {
  let passwordResetToken = await Token.findOne({ userId });

  if (!passwordResetToken) {
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, passwordResetToken.token);

  if (!isValid) {
    return new Error('Invalid or expired password reset token');
  }

  const hash = bcrypt.hashSync(password, 10);

  await User.updateOne({ _id: userId }, { $set: { password: hash } }, { new: true });

  const user = await User.findById({ _id: userId });

  sendEmail(
    user.email,
    'Password Reset Successfully',
    {
      name: user.name,
    },
    'passwordReset.handlebars',
  );

  await passwordResetToken.deleteOne();

  return { message: 'Password reset was successful' };
};

/**
 * Set Auth Tokens
 *
 * @param {String} userId
 * @param {Object} res
 * @param {String} sessionId
 * @returns
 */
const setAuthTokens = async (userId, res, sessionId = null) => {
  try {
    const user = await User.findOne({ _id: userId });
    const token = await user.generateToken();

    let session;
    let refreshTokenExpires;
    if (sessionId) {
      session = await Session.findById(sessionId);
      refreshTokenExpires = session.expiration.getTime();
    } else {
      session = new Session({ user: userId });
      const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
      const expires = eval(REFRESH_TOKEN_EXPIRY) ?? 1000 * 60 * 60 * 24 * 7;
      refreshTokenExpires = Date.now() + expires;
    }

    const refreshToken = await session.generateRefreshToken();

    res.cookie('refreshToken', refreshToken, {
      expires: new Date(refreshTokenExpires),
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });

    return token;
  } catch (error) {
    logger.error('[setAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};

module.exports = {
  registerUser,
  logoutUser,
  isDomainAllowed,
  requestPasswordReset,
  resetPassword,
  setAuthTokens,
};
