const bcrypt = require('bcryptjs');
const { webcrypto } = require('node:crypto');
const { SystemRoles, errorsToString } = require('librechat-data-provider');
const {
  findUser,
  countUsers,
  createUser,
  updateUser,
  getUserById,
  generateToken,
  deleteUserById,
} = require('~/models/userMethods');
const {
  createToken,
  findToken,
  deleteTokens,
  findSession,
  deleteSession,
  createSession,
  generateRefreshToken,
} = require('~/models');
const { isEnabled, checkEmailConfig, sendEmail } = require('~/server/utils');
const { isEmailDomainAllowed } = require('~/server/services/domains');
const { registerSchema } = require('~/strategies/validators');
const { hashToken } = require('~/server/utils/crypto');
const { logger } = require('~/config');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

const isProduction = process.env.NODE_ENV === 'production';
const genericVerificationMessage = 'Please check your email to verify your email address.';

/**
 * Logout user
 *
 * @param {String} userId
 * @param {*} refreshToken
 * @returns
 */
const logoutUser = async (userId, refreshToken) => {
  try {
    const hash = await hashToken(refreshToken);

    // Find the session with the matching user and refreshTokenHash
    const session = await findSession({ userId: userId, refreshToken: hash });

    if (session) {
      try {
        await deleteSession({ sessionId: session._id });
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
 * Creates Token and corresponding Hash for verification
 * @returns {[string, string]}
 */
const createTokenHash = () => {
  const token = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash = bcrypt.hashSync(token, 10);
  return [token, hash];
};

/**
 * Send Verification Email
 * @param {Partial<MongoUser> & { _id: ObjectId, email: string, name: string}} user
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (user) => {
  const [verifyToken, hash] = createTokenHash();

  const verificationLink = `${
    domains.client
  }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  await sendEmail({
    email: user.email,
    subject: 'Verify your email',
    payload: {
      appName: process.env.APP_TITLE || 'LibreChat',
      name: user.name,
      verificationLink: verificationLink,
      year: new Date().getFullYear(),
    },
    template: 'verifyEmail.handlebars',
  });

  await createToken({
    userId: user._id,
    email: user.email,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  logger.info(`[sendVerificationEmail] Verification link issued. [Email: ${user.email}]`);
};

/**
 * Verify Email
 * @param {Express.Request} req
 */
const verifyEmail = async (req) => {
  const { email, token } = req.body;
  let emailVerificationData = await findToken({ email: decodeURIComponent(email) });

  if (!emailVerificationData) {
    logger.warn(`[verifyEmail] [No email verification data found] [Email: ${email}]`);
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, emailVerificationData.token);

  if (!isValid) {
    logger.warn(`[verifyEmail] [Invalid or expired email verification token] [Email: ${email}]`);
    return new Error('Invalid or expired email verification token');
  }

  const updatedUser = await updateUser(emailVerificationData.userId, { emailVerified: true });
  if (!updatedUser) {
    logger.warn(`[verifyEmail] [User not found] [Email: ${email}]`);
    return new Error('User not found');
  }

  await deleteTokens({ token: emailVerificationData.token });
  logger.info(`[verifyEmail] Email verification successful. [Email: ${email}]`);
  return { message: 'Email verification was successful' };
};

/**
 * Register a new user.
 * @param {MongoUser} user <email, password, name, username>
 * @param {Partial<MongoUser>} [additionalData={}]
 * @returns {Promise<{status: number, message: string, user?: MongoUser}>}
 */
const registerUser = async (user, additionalData = {}) => {
  const { error } = registerSchema.safeParse(user);
  if (error) {
    const errorMessage = errorsToString(error.errors);
    logger.info(
      'Route: register - Validation Error',
      { name: 'Request params:', value: user },
      { name: 'Validation error:', value: errorMessage },
    );

    return { status: 404, message: errorMessage };
  }

  const { email, password, name, username } = user;

  let newUserId;
  try {
    const existingUser = await findUser({ email }, 'email _id');

    if (existingUser) {
      logger.info(
        'Register User - Email in use',
        { name: 'Request params:', value: user },
        { name: 'Existing user:', value: existingUser },
      );

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { status: 200, message: genericVerificationMessage };
    }

    if (!(await isEmailDomainAllowed(email))) {
      const errorMessage =
        'The email address provided cannot be used. Please use a different email address.';
      logger.error(`[registerUser] [Registration not allowed] [Email: ${user.email}]`);
      return { status: 403, message: errorMessage };
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = (await countUsers()) === 0;

    const salt = bcrypt.genSaltSync(10);
    const newUserData = {
      provider: 'local',
      email,
      username,
      name,
      avatar: null,
      role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
      password: bcrypt.hashSync(password, salt),
      ...additionalData,
    };

    const emailEnabled = checkEmailConfig();
    const disableTTL = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN);
    const newUser = await createUser(newUserData, disableTTL, true);
    newUserId = newUser._id;
    if (emailEnabled && !newUser.emailVerified) {
      await sendVerificationEmail({
        _id: newUserId,
        email,
        name,
      });
    } else {
      await updateUser(newUserId, { emailVerified: true });
    }

    return { status: 200, message: genericVerificationMessage };
  } catch (err) {
    logger.error('[registerUser] Error in registering user:', err);
    if (newUserId) {
      const result = await deleteUserById(newUserId);
      logger.warn(
        `[registerUser] [Email: ${email}] [Temporary User deleted: ${JSON.stringify(result)}]`,
      );
    }
    return { status: 500, message: 'Something went wrong' };
  }
};

/**
 * Request password reset
 * @param {Express.Request} req
 */
const requestPasswordReset = async (req) => {
  const { email } = req.body;
  const user = await findUser({ email }, 'email _id');
  const emailEnabled = checkEmailConfig();

  logger.warn(`[requestPasswordReset] [Password reset request initiated] [Email: ${email}]`);

  if (!user) {
    logger.warn(`[requestPasswordReset] [No user found] [Email: ${email}] [IP: ${req.ip}]`);
    return {
      message: 'If an account with that email exists, a password reset link has been sent to it.',
    };
  }

  await deleteTokens({ userId: user._id });

  const [resetToken, hash] = createTokenHash();

  await createToken({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

  if (emailEnabled) {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name,
        link: link,
        year: new Date().getFullYear(),
      },
      template: 'requestPasswordReset.handlebars',
    });
    logger.info(
      `[requestPasswordReset] Link emailed. [Email: ${email}] [ID: ${user._id}] [IP: ${req.ip}]`,
    );
  } else {
    logger.info(
      `[requestPasswordReset] Link issued. [Email: ${email}] [ID: ${user._id}] [IP: ${req.ip}]`,
    );
    return { link };
  }

  return {
    message: 'If an account with that email exists, a password reset link has been sent to it.',
  };
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
  let passwordResetToken = await findToken({
    userId,
  });

  if (!passwordResetToken) {
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, passwordResetToken.token);

  if (!isValid) {
    return new Error('Invalid or expired password reset token');
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await updateUser(userId, { password: hash });

  if (checkEmailConfig()) {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Successfully',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name,
        year: new Date().getFullYear(),
      },
      template: 'passwordReset.handlebars',
    });
  }

  await deleteTokens({ token: passwordResetToken.token });
  logger.info(`[resetPassword] Password reset successful. [Email: ${user.email}]`);
  return { message: 'Password reset was successful' };
};

/**
 * Set Auth Tokens
 *
 * @param {String | ObjectId} userId
 * @param {Object} res
 * @param {String} sessionId
 * @returns
 */
const setAuthTokens = async (userId, res, sessionId = null) => {
  try {
    const user = await getUserById(userId);
    const token = await generateToken(user);

    let session;
    let refreshToken;
    let refreshTokenExpires;

    if (sessionId) {
      session = await findSession({ sessionId: sessionId }, { lean: false });
      refreshTokenExpires = session.expiration.getTime();
      refreshToken = await generateRefreshToken(session);
    } else {
      const result = await createSession(userId);
      session = result.session;
      refreshToken = result.refreshToken;
      refreshTokenExpires = session.expiration.getTime();
    }

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

/**
 * Resend Verification Email
 * @param {Object} req
 * @param {Object} req.body
 * @param {String} req.body.email
 * @returns {Promise<{status: number, message: string}>}
 */
const resendVerificationEmail = async (req) => {
  try {
    const { email } = req.body;
    await deleteTokens(email);
    const user = await findUser({ email }, 'email _id name');

    if (!user) {
      logger.warn(`[resendVerificationEmail] [No user found] [Email: ${email}]`);
      return { status: 200, message: genericVerificationMessage };
    }

    const [verifyToken, hash] = createTokenHash();

    const verificationLink = `${
      domains.client
    }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      email: user.email,
      subject: 'Verify your email',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name,
        verificationLink: verificationLink,
        year: new Date().getFullYear(),
      },
      template: 'verifyEmail.handlebars',
    });

    await createToken({
      userId: user._id,
      email: user.email,
      token: hash,
      createdAt: Date.now(),
      expiresIn: 900,
    });

    logger.info(`[resendVerificationEmail] Verification link issued. [Email: ${user.email}]`);

    return {
      status: 200,
      message: genericVerificationMessage,
    };
  } catch (error) {
    logger.error(`[resendVerificationEmail] Error resending verification email: ${error.message}`);
    return {
      status: 500,
      message: 'Something went wrong.',
    };
  }
};

module.exports = {
  logoutUser,
  verifyEmail,
  registerUser,
  setAuthTokens,
  resetPassword,
  requestPasswordReset,
  resendVerificationEmail,
};
