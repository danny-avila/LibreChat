const Session = require('../../models/Session');
const User = require('../../models/User');
const Token = require('../../models/schema/tokenSchema');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { registerSchema } = require('../../strategies/validators');
const { sendEmail } = require('../../utils');
const config = require('../../../config/loader');
const domains = config.domains;
const isProduction = config.isProduction;

/**
 * Logout user
 *
 * @param {String} userId
 * @param {*} refreshToken
 * @returns
 */
const logoutUser = async (userId, refreshToken) => {
  try {
    const userFound = await User.findById(userId);
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find the session with the matching user and refreshTokenHash
    const session = await Session.findOne({ user: userId, refreshTokenHash: hash });
    console.log('Removing Session: ', session);
    if (session) {
      await Session.deleteOne({ _id: session._id });
    }
    await userFound.save();

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
  const { error } = registerSchema.validate(user);
  if (error) {
    console.info(
      'Route: register - Joi Validation Error',
      { name: 'Request params:', value: user },
      { name: 'Validation error:', value: error.details },
    );

    return { status: 422, message: error.details[0].message };
  }

  const { email, password, name, username } = user;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.info(
        'Register User - Email in use',
        { name: 'Request params:', value: user },
        { name: 'Existing user:', value: existingUser },
      );

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: We should change the process to always email and be generic is signup works or fails (user enum)
      return { status: 500, message: 'Something went wrong' };
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
    newUser.save();

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
  const user = await User.findOne({ email });
  if (!user) {
    return new Error('Email does not exist');
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  let resetToken = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hashSync(resetToken, 10);

  await new Token({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
  }).save();

  const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

  sendEmail(
    user.email,
    'Password Reset Request',
    {
      name: user.name,
      link: link,
    },
    './template/requestResetPassword.handlebars',
  );
  return { link };
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
    './template/resetPassword.handlebars',
  );

  await passwordResetToken.deleteOne();

  return { message: 'Password reset was successful' };
};

/**
 * Set Auth Tokens
 *
 * @param {String} userId
 * @param {Object} res
 * @returns
 */
const setAuthTokens = async (userId, res) => {
  try {
    const user = await User.findOne({ _id: userId });
    const token = await user.generateToken();

    const session = new Session({ user: userId });
    const refreshToken = await session.generateRefreshToken();

    const tokenExpires = eval(process.env.SESSION_EXPIRY);
    const refreshTokenExpires = eval(process.env.REFRESH_TOKEN_EXPIRY);

    res.cookie('token', token, {
      expires: new Date(Date.now() + tokenExpires),
      httpOnly: false,
      secure: isProduction,
    });

    res.cookie('refreshToken', refreshToken, {
      expires: new Date(Date.now() + refreshTokenExpires),
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      // signed: true,
    });

    return token;
  } catch (error) {
    console.log('Error in setting authentication tokens:', error);
    throw error;
  }
};

module.exports = {
  registerUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  setAuthTokens,
};
