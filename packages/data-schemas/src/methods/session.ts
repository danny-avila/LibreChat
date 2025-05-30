import mongoose from 'mongoose';
import { Session } from '~/models';
import {
  ISession,
  CreateSessionOptions,
  SessionSearchParams,
  SessionQueryOptions,
  DeleteSessionParams,
  DeleteAllSessionsOptions,
  SessionResult,
  SessionError,
} from '~/types';
import { signPayload, hashToken } from '~/schema/session';
import logger from '~/config/winston';

const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
const expires = eval(REFRESH_TOKEN_EXPIRY ?? '0') ?? 1000 * 60 * 60 * 24 * 7; // 7 days default

/**
 * Creates a new session for a user
 */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {},
): Promise<SessionResult> {
  if (!userId) {
    throw new SessionError('User ID is required', 'INVALID_USER_ID');
  }

  try {
    const session = {
      _id: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(userId),
      expiration: options.expiration || new Date(Date.now() + expires),
    };
    const refreshToken = await generateRefreshToken(session);

    return { session, refreshToken };
  } catch (error) {
    logger.error('[createSession] Error creating session:', error);
    throw new SessionError('Failed to create session', 'CREATE_SESSION_FAILED');
  }
}

/**
 * Finds a session by various parameters
 */
export async function findSession(
  params: SessionSearchParams,
  options: SessionQueryOptions = { lean: true },
): Promise<ISession | null> {
  try {
    const query: Record<string, unknown> = {};

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
      const sessionId =
        typeof params.sessionId === 'object' && 'sessionId' in params.sessionId
          ? params.sessionId.sessionId
          : params.sessionId;
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        throw new SessionError('Invalid session ID format', 'INVALID_SESSION_ID');
      }
      query._id = sessionId;
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
}

/**
 * Deletes a session by refresh token or session ID
 */
export async function deleteSession(
  params: DeleteSessionParams,
): Promise<{ deletedCount?: number }> {
  try {
    if (!params.refreshToken && !params.sessionId) {
      throw new SessionError(
        'Either refreshToken or sessionId is required',
        'INVALID_DELETE_PARAMS',
      );
    }

    const query: Record<string, unknown> = {};

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
}

/**
 * Generates a refresh token for a session
 */
export async function generateRefreshToken(session: Partial<ISession>): Promise<string> {
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
    await Session.create(session);
    return refreshToken;
  } catch (error) {
    logger.error('[generateRefreshToken] Error generating refresh token:', error);
    throw new SessionError('Failed to generate refresh token', 'GENERATE_TOKEN_FAILED');
  }
}

/**
 * Deletes all sessions for a user
 */
export async function deleteAllUserSessions(
  userId: string | { userId: string },
  options: DeleteAllSessionsOptions = {},
): Promise<{ deletedCount?: number }> {
  try {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    // Extract userId if it's passed as an object
    const userIdString = typeof userId === 'object' ? userId.userId : userId;

    if (!mongoose.Types.ObjectId.isValid(userIdString)) {
      throw new SessionError('Invalid user ID format', 'INVALID_USER_ID_FORMAT');
    }

    const query: Record<string, unknown> = { user: userIdString };

    if (options.excludeCurrentSession && options.currentSessionId) {
      query._id = { $ne: options.currentSessionId };
    }

    const result = await Session.deleteMany(query);

    if (result.deletedCount && result.deletedCount > 0) {
      logger.debug(
        `[deleteAllUserSessions] Deleted ${result.deletedCount} sessions for user ${userIdString}.`,
      );
    }

    return result;
  } catch (error) {
    logger.error('[deleteAllUserSessions] Error deleting user sessions:', error);
    throw new SessionError('Failed to delete user sessions', 'DELETE_ALL_SESSIONS_FAILED');
  }
}
