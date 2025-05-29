import mongoose, { Schema, Document, Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import logger  from '../config/winston';
const { webcrypto } = require('node:crypto');

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
}

const sessionSchema: Schema<ISession> = new Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

/**
 * Error class for Session-related errors
 */
class SessionError extends Error {
  constructor(message, code = 'SESSION_ERROR') {
    super(message);
    this.name = 'SessionError';
    this.code = code;
  }
}
const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
const expires = eval(REFRESH_TOKEN_EXPIRY) ?? 1000 * 60 * 60 * 24 * 7; // 7 days default

/**
 * Creates a new session for a user
 * @param {string} userId - The ID of the user
 * @param {Object} options - Additional options for session creation
 * @param {Date} options.expiration - Custom expiration date
 * @returns {Promise<{session: Session, refreshToken: string}>}
 * @throws {SessionError}
 */
sessionSchema.statics.createSession = async function (userId, options = {}) {
  if (!userId) {
    throw new SessionError('User ID is required', 'INVALID_USER_ID');
  }

  try {
    const session = {
      _id: new Types.ObjectId(),
      user: userId,
      expiration: options.expiration || new Date(Date.now() + expires),
    };
    const refreshToken = await this.generateRefreshToken(session);

    return { session, refreshToken };
  } catch (error) {
    logger.error('[createSession] Error creating session:', error);
    throw new SessionError('Failed to create session', 'CREATE_SESSION_FAILED');
  }
};

/**
 * Finds a session by various parameters
 * @param {Object} params - Search parameters
 * @param {string} [params.refreshToken] - The refresh token to search by
 * @param {string} [params.userId] - The user ID to search by
 * @param {string} [params.sessionId] - The session ID to search by
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.lean=true] - Whether to return plain objects instead of documents
 * @returns {Promise<Session|null>}
 * @throws {SessionError}
 */
sessionSchema.statics.findSession = async function (params, options = { lean: true }) {
  try {
    const query = {};

    if (!params.refreshToken && !params.userId && !params.sessionId) {
      throw new SessionError('At least one search parameter is required', 'INVALID_SEARCH_PARAMS');
    }

    if (params.refreshToken) {
      const tokenHash = await hashToken(params.refreshToken);
      query.refreshTokenHash = tokenHash;
    }

    if (params.userId) {
      query.user = params.userId;
    }

    if (params.sessionId) {
      const sessionId = params.sessionId.sessionId || params.sessionId;
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        throw new SessionError('Invalid session ID format', 'INVALID_SESSION_ID');
      }
      query._id = sessionId;
    }

    // Add expiration check to only return valid sessions
    query.expiration = { $gt: new Date() };

    const sessionQuery = this.findOne(query);

    if (options.lean) {
      return await sessionQuery.lean();
    }

    return await sessionQuery.exec();
  } catch (error) {
    logger.error('[findSession] Error finding session:', error);
    throw new SessionError('Failed to find session', 'FIND_SESSION_FAILED');
  }
};

/**
 * Deletes a session by refresh token or session ID
 * @param {Object} params - Delete parameters
 * @param {string} [params.refreshToken] - The refresh token of the session to delete
 * @param {string} [params.sessionId] - The ID of the session to delete
 * @returns {Promise<Object>}
 * @throws {SessionError}
 */
sessionSchema.statics.deleteSession = async function (params) {
  try {
    if (!params.refreshToken && !params.sessionId) {
      throw new SessionError(
        'Either refreshToken or sessionId is required',
        'INVALID_DELETE_PARAMS',
      );
    }

    const query = {};

    if (params.refreshToken) {
      query.refreshTokenHash = await hashToken(params.refreshToken);
    }

    if (params.sessionId) {
      query._id = params.sessionId;
    }

    const result = await this.deleteOne(query);

    if (result.deletedCount === 0) {
      logger.warn('[deleteSession] No session found to delete');
    }

    return result;
  } catch (error) {
    logger.error('[deleteSession] Error deleting session:', error);
    throw new SessionError('Failed to delete session', 'DELETE_SESSION_FAILED');
  }
};

/**
 * Generates a refresh token for a session
 * @param {Session} session - The session to generate a token for
 * @returns {Promise<string>}
 * @throws {SessionError}
 */
sessionSchema.statics.generateRefreshToken = async function (session) {
  if (!session || !session.user) {
    throw new SessionError('Invalid session object', 'INVALID_SESSION');
  }

  try {
    const expiresIn = session.expiration ? session.expiration.getTime() : Date.now() + expires;
    if (!session.expiration) {
      session.expiration = new Date(expiresIn);
    }

    const refreshToken = await signPayload({
      payload: {
        id: session.user,
        sessionId: session._id,
      },
      secret: process.env.JWT_REFRESH_SECRET,
      expirationTime: Math.floor((expiresIn - Date.now()) / 1000),
    });

    session.refreshTokenHash = await hashToken(refreshToken);
    await this.create(session);
    return refreshToken;
  } catch (error) {
    logger.error('[generateRefreshToken] Error generating refresh token:', error);
    throw new SessionError('Failed to generate refresh token', 'GENERATE_TOKEN_FAILED');
  }
};

/**
 * Deletes all sessions for a user
 * @param {string} userId - The ID of the user
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.excludeCurrentSession] - Whether to exclude the current session
 * @param {string} [options.currentSessionId] - The ID of the current session to exclude
 * @returns {Promise<Object>}
 * @throws {SessionError}
 */
sessionSchema.statics.deleteAllUserSessions = async function (userId, options = {}) {
  try {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    // Extract userId if it's passed as an object
    const userIdString = userId.userId || userId;

    if (!mongoose.Types.ObjectId.isValid(userIdString)) {
      throw new SessionError('Invalid user ID format', 'INVALID_USER_ID_FORMAT');
    }

    const query = { user: userIdString };

    if (options.excludeCurrentSession && options.currentSessionId) {
      query._id = { $ne: options.currentSessionId };
    }

    const result = await this.deleteMany(query);

    if (result.deletedCount > 0) {
      logger.debug(
        `[deleteAllUserSessions] Deleted ${result.deletedCount} sessions for user ${userIdString}.`,
      );
    }

    return result;
  } catch (error) {
    logger.error('[deleteAllUserSessions] Error deleting user sessions:', error);
    throw new SessionError('Failed to delete user sessions', 'DELETE_ALL_SESSIONS_FAILED');
  }
};

export async function signPayload({ payload, secret, expirationTime }) {
  return jwt.sign(payload, secret, { expiresIn: expirationTime });
}

export async function hashToken(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}
export default sessionSchema;
