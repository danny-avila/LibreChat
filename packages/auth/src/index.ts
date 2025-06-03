import { Request, Response } from 'express';
import { TokenEndpointResponse } from 'openid-client';
import { errorsToString, SystemRoles } from 'librechat-data-provider';
import bcrypt from 'bcryptjs';
import { IUser } from '@librechat/data-schemas';
import { registerSchema } from './strategies/validators';
import { webcrypto } from 'node:crypto';
import { sendEmail } from './utils/sendEmail';
import logger from './config/winston';
import { ObjectId } from 'mongoose';
import { checkEmailConfig, isEnabled } from './utils';
import { initAuthModels, getMethods } from './init';

const genericVerificationMessage = 'Please check your email to verify your email address.';
const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

interface LogoutResponse {
  status: number;
  message: string;
}
interface AuthenticatedRequest extends Request {
  user?: { _id: string };
  session?: {
    destroy: (callback?: (err?: any) => void) => void;
  };
}

/**
 * Logout user
 *
 * @param req
 * @param {string} refreshToken
 * @returns
 */
const logoutUser = async (
  req: AuthenticatedRequest,
  refreshToken: string | null,
): Promise<LogoutResponse> => {
  try {
    const { findSession, deleteSession } = getMethods();
    const userId: string | null = req.user?._id ?? null;
    const session = await findSession({ userId: userId, refreshToken });

    if (session) {
      try {
        await deleteSession({ sessionId: session._id });
      } catch (deleteErr) {
        logger.error('[logoutUser] Failed to delete session.', deleteErr);
        return { status: 500, message: 'Failed to delete session.' };
      }
    }

    try {
      req.session?.destroy();
    } catch (destroyErr) {
      logger.debug('[logoutUser] Failed to destroy session.', destroyErr);
    }

    return { status: 200, message: 'Logout successful' };
  } catch (err: any) {
    return { status: 500, message: err.message };
  }
};

/**
 * Register a new user.
 * @param {MongoUser} user <email, password, name, username>
 * @param {Partial<MongoUser>} [additionalData={}]
 * @returns {Promise<{status: number, message: string, user?: MongoUser}>}
 */
const registerUser = async (
  user: IUser,
  additionalData: Partial<IUser> = {},
  isEmailDomainAllowed: boolean = true,
  balanceConfig: Record<string, any>,
) => {
  const { error } = registerSchema.safeParse(user);
  const { findUser, countUsers, createUser, updateUser, deleteUserById } = getMethods();
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

    if (!isEmailDomainAllowed) {
      const errorMessage =
        'The email address provided cannot be used. Please use a different email address.';
      logger.error(`[registerUser] [Registration not allowed] [Email: ${user.email}]`);
      return { status: 403, message: errorMessage };
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = (await countUsers()) === 0;

    const salt = bcrypt.genSaltSync(10);
    const newUserData: Partial<IUser> = {
      provider: 'local',
      email,
      username,
      name,
      avatar: '',
      role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
      password: bcrypt.hashSync(password ?? '', salt),
      ...additionalData,
    };

    const emailEnabled = checkEmailConfig();
    const disableTTL = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN ?? '');

    const newUser = await createUser(newUserData, balanceConfig, disableTTL, true);
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
 * Creates Token and corresponding Hash for verification
 * @returns {[string, string]}
 */
const createTokenHash = (): [string, string] => {
  const token: string = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash: string = bcrypt.hashSync(token, 10);
  return [token, hash];
};

/**
 * Send Verification Email
 * @param {Partial<MongoUser> & { _id: ObjectId, email: string, name: string}} user
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (user: Partial<IUser> & { _id: ObjectId; email: string }) => {
  const [verifyToken, hash] = createTokenHash();
  const { createToken } = getMethods();
  const verificationLink = `${
    domains.client
  }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  await sendEmail({
    email: user.email,
    subject: 'Verify your email',
    payload: {
      appName: process.env.APP_TITLE || 'LibreChat',
      name: user.name || user.username || user.email,
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
const verifyEmail = async (req: Request) => {
  const { email, token } = req.body;
  const decodedEmail = decodeURIComponent(email);
  const { findUser, findToken, updateUser, deleteTokens } = getMethods();

  const user = await findUser({ email: decodedEmail }, 'email _id emailVerified');

  if (!user) {
    logger.warn(`[verifyEmail] [User not found] [Email: ${decodedEmail}]`);
    return new Error('User not found');
  }

  if (user.emailVerified) {
    logger.info(`[verifyEmail] Email already verified [Email: ${decodedEmail}]`);
    return { message: 'Email already verified', status: 'success' };
  }

  let emailVerificationData = await findToken({ email: decodedEmail });

  if (!emailVerificationData) {
    logger.warn(`[verifyEmail] [No email verification data found] [Email: ${decodedEmail}]`);
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, emailVerificationData.token);

  if (!isValid) {
    logger.warn(
      `[verifyEmail] [Invalid or expired email verification token] [Email: ${decodedEmail}]`,
    );
    return new Error('Invalid or expired email verification token');
  }

  const updatedUser = await updateUser(emailVerificationData.userId, { emailVerified: true });

  if (!updatedUser) {
    logger.warn(`[verifyEmail] [User update failed] [Email: ${decodedEmail}]`);
    return new Error('Failed to update user verification status');
  }

  await deleteTokens({ token: emailVerificationData.token });
  logger.info(`[verifyEmail] Email verification successful [Email: ${decodedEmail}]`);
  return { message: 'Email verification was successful', status: 'success' };
};

/**
 * Resend Verification Email
 * @param {Object} req
 * @param {Object} req.body
 * @param {String} req.body.email
 * @returns {Promise<{status: number, message: string}>}
 */
const resendVerificationEmail = async (req: Request) => {
  try {
    const { deleteTokens, findUser, createToken } = getMethods();
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
        name: user.name || user.username || user.email,
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
  } catch (error: any) {
    logger.error(`[resendVerificationEmail] Error resending verification email: ${error.message}`);
    return {
      status: 500,
      message: 'Something went wrong.',
    };
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
const resetPassword = async (userId: string | ObjectId, token: string, password: string) => {
  const { findToken, updateUser, deleteTokens } = getMethods();
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
        name: user.name || user.username || user.email,
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
 * Request password reset
 * @param {Express.Request} req
 */
const requestPasswordReset = async (req: Request) => {
  const { email } = req.body;
  const { findUser, createToken, deleteTokens } = getMethods();
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
        name: user.name || user.username || user.email,
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

const isProduction = process.env.NODE_ENV === 'production';
/**
 * Set Auth Tokens
 *
 * @param {String | ObjectId} userId
 * @param {Object} res
 * @param {String} sessionId
 * @returns
 */
const setAuthTokens = async (
  userId: string | ObjectId,
  res: Response,
  sessionId: string | null = null,
) => {
  try {
    const { getUserById, generateToken, findSession, generateRefreshToken, createSession } =
      getMethods();
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
    res.cookie('token_provider', 'librechat', {
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
 * @function setOpenIDAuthTokens
 * Set OpenID Authentication Tokens
 * //type tokenset from openid-client
 * @param {import('openid-client').TokenEndpointResponse & import('openid-client').TokenEndpointResponseHelpers} tokenset
 * - The tokenset object containing access and refresh tokens
 * @param {Object} res - response object
 * @returns {String} - access token
 */
const setOpenIDAuthTokens = (tokenset: TokenEndpointResponse, res: Response) => {
  try {
    if (!tokenset) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
    const expiryInMilliseconds = eval(REFRESH_TOKEN_EXPIRY ?? '') ?? 1000 * 60 * 60 * 24 * 7; // 7 days default
    const expirationDate = new Date(Date.now() + expiryInMilliseconds);
    if (tokenset == null) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    if (!tokenset.access_token || !tokenset.refresh_token) {
      logger.error('[setOpenIDAuthTokens] No access or refresh token found in tokenset');
      return;
    }
    res.cookie('refreshToken', tokenset.refresh_token, {
      expires: expirationDate,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    res.cookie('token_provider', 'openid', {
      expires: expirationDate,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    return tokenset.access_token;
  } catch (error) {
    logger.error('[setOpenIDAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};
export {
  setOpenIDAuthTokens,
  setAuthTokens,
  logoutUser,
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  resetPassword,
  requestPasswordReset,
  checkEmailConfig,
  initAuthModels,
};
