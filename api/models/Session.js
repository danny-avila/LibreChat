const mongoose = require('mongoose');
const signPayload = require('~/server/services/signPayload');
const { hashToken } = require('~/server/utils/crypto');
const sessionSchema = require('./schema/session');
const { logger } = require('~/config');

const Session = mongoose.model('Session', sessionSchema);

const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
const expires = eval(REFRESH_TOKEN_EXPIRY) ?? 1000 * 60 * 60 * 24 * 7; // 7 days default

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

/**
 * Creates a new session for a user
 * @param {string} userId - The ID of the user
 * @param {Object} options - Additional options for session creation
 * @param {Date} options.expiration - Custom expiration date
 * @returns {Promise<{session: Session, refreshToken: string}>}
 * @throws {SessionError}
 */
const createSession = async (userId, options = {}) => {
  if (!userId) {
    throw new SessionError('User ID is required', 'INVALID_USER_ID');
  }

  try {
    const session = new Session({
      user: userId,
      expiration: options.expiration || new Date(Date.now() + expires),
    });
    const refreshToken = await generateRefreshToken(session);
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
const findSession = async (params, options = { lean: true }) => {
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
      query._id = params.sessionId;
    }

    // Add expiration check to only return valid sessions
    query.expiration = { $gt: new Date() };

    const sessionQuery = Session.findOne(query);

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
 * Updates session expiration
 * @param {Session|string} session - The session or session ID to update
 * @param {Date} [newExpiration] - Optional new expiration date
 * @returns {Promise<Session>}
 * @throws {SessionError}
 */
const updateExpiration = async (session, newExpiration) => {
  try {
    const sessionDoc = typeof session === 'string' ? await Session.findById(session) : session;

    if (!sessionDoc) {
      throw new SessionError('Session not found', 'SESSION_NOT_FOUND');
    }

    sessionDoc.expiration = newExpiration || new Date(Date.now() + expires);
    return await sessionDoc.save();
  } catch (error) {
    logger.error('[updateExpiration] Error updating session:', error);
    throw new SessionError('Failed to update session expiration', 'UPDATE_EXPIRATION_FAILED');
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
const deleteSession = async (params) => {
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

    const result = await Session.deleteOne(query);

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
 * Deletes all sessions for a user
 * @param {string} userId - The ID of the user
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.excludeCurrentSession] - Whether to exclude the current session
 * @param {string} [options.currentSessionId] - The ID of the current session to exclude
 * @returns {Promise<Object>}
 * @throws {SessionError}
 */
const deleteAllUserSessions = async (userId, options = {}) => {
  try {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    const query = { user: userId };

    if (options.excludeCurrentSession && options.currentSessionId) {
      query._id = { $ne: options.currentSessionId };
    }

    const result = await Session.deleteMany(query);

    if (result.deletedCount > 0) {
      logger.debug(
        `[deleteAllUserSessions] Deleted ${result.deletedCount} sessions for user ${userId}.`,
      );
    }

    return result;
  } catch (error) {
    logger.error('[deleteAllUserSessions] Error deleting user sessions:', error);
    throw new SessionError('Failed to delete user sessions', 'DELETE_ALL_SESSIONS_FAILED');
  }
};

/**
 * Generates a refresh token for a session
 * @param {Session} session - The session to generate a token for
 * @returns {Promise<string>}
 * @throws {SessionError}
 */
const generateRefreshToken = async (session) => {
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
    await session.save();

    return refreshToken;
  } catch (error) {
    logger.error('[generateRefreshToken] Error generating refresh token:', error);
    throw new SessionError('Failed to generate refresh token', 'GENERATE_TOKEN_FAILED');
  }
};

/**
 * Counts active sessions for a user
 * @param {string} userId - The ID of the user
 * @returns {Promise<number>}
 * @throws {SessionError}
 */
const countActiveSessions = async (userId) => {
  try {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    return await Session.countDocuments({
      user: userId,
      expiration: { $gt: new Date() },
    });
  } catch (error) {
    logger.error('[countActiveSessions] Error counting active sessions:', error);
    throw new SessionError('Failed to count active sessions', 'COUNT_SESSIONS_FAILED');
  }
};

module.exports = {
  createSession,
  findSession,
  updateExpiration,
  deleteSession,
  deleteAllUserSessions,
  generateRefreshToken,
  countActiveSessions,
  SessionError,
};
