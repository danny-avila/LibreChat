import { Request, Response } from 'express';
import { TokenEndpointResponse } from 'openid-client';
import { errorsToString, SystemRoles } from 'librechat-data-provider';
import bcrypt from 'bcryptjs';
import { IUser, logger } from '@librechat/data-schemas';
import { registerSchema } from './strategies/validators';

import { sendVerificationEmail } from './utils/email';
import { ObjectId } from 'mongoose';
import { initAuth, getMethods } from './initAuth';
import { AuthenticatedRequest, LogoutResponse } from './types';
import { checkEmailConfig, isEnabled } from './utils';

const genericVerificationMessage = 'Please check your email to verify your email address.';
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

export { setOpenIDAuthTokens, setAuthTokens, logoutUser, registerUser, initAuth };
export * from './strategies';
export * from './utils';
