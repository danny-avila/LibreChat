import type { Model } from 'mongoose';
import type * as t from '~/types/session';
import { signPayload, hashToken } from '~/crypto';
import logger from '~/config/winston';

export class SessionError extends Error {
  public code: string;

  constructor(message: string, code: string = 'SESSION_ERROR') {
    super(message);
    this.name = 'SessionError';
    this.code = code;
  }
}

/** Default refresh token expiry: 7 days in milliseconds */
export const DEFAULT_REFRESH_TOKEN_EXPIRY: number = 1000 * 60 * 60 * 24 * 7;

// Factory function that takes mongoose instance and returns the methods
export function createSessionMethods(mongoose: typeof import('mongoose')): {
  findSession: (
    params: t.SessionSearchParams,
    options?: t.SessionQueryOptions,
  ) => Promise<t.ISession | null>;
  SessionError: typeof SessionError;
  deleteSession: (params: t.DeleteSessionParams) => Promise<{ deletedCount?: number }>;
  createSession: (userId: string, options?: t.CreateSessionOptions) => Promise<t.SessionResult>;
  updateExpiration: (
    session: t.ISession | string,
    newExpiration?: Date,
    options?: t.UpdateExpirationOptions,
  ) => Promise<t.ISession>;
  countActiveSessions: (userId: string) => Promise<number>;
  generateRefreshToken: (
    session: t.ISession,
    options?: { dbSession?: import('mongoose').ClientSession },
  ) => Promise<string>;
  deleteAllUserSessions: (
    userId: string | { userId: string },
    options?: t.DeleteAllSessionsOptions,
  ) => Promise<{ deletedCount?: number }>;
  findClerkSessionIdsByClerkUserId: (
    clerkUserId: string,
    options?: t.ClerkSessionLifecycleOptions,
  ) => Promise<readonly string[]>;
  deleteSessionsByClerkSessionId: (
    clerkSessionId: string,
    options?: t.ClerkSessionLifecycleOptions,
  ) => Promise<{ deletedCount?: number }>;
  deleteSessionsByClerkUserId: (
    clerkUserId: string,
    options?: t.ClerkSessionLifecycleOptions,
  ) => Promise<{ deletedCount?: number }>;
} {
  function sessionModel(): Model<t.ISession> {
    return mongoose.models.Session as Model<t.ISession>;
  }

  function requireClerkIdentifier(value: string): string {
    if (value.trim().length === 0) {
      throw new SessionError('Clerk provider identifier is required', 'INVALID_CLERK_ID');
    }
    return value;
  }

  /**
   * Creates a new session for a user
   */
  async function createSession(
    userId: string,
    options: t.CreateSessionOptions = {},
  ): Promise<t.SessionResult> {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    try {
      const Session = mongoose.models.Session;
      const currentSession = new Session(
        options.clerk
          ? {
              user: userId,
              expiration: options.clerk.absoluteExpiresAt,
              authProvider: options.clerk.authProvider,
              clerkSessionId: options.clerk.clerkSessionId,
              clerkTokenId: options.clerk.clerkTokenId,
              clerkUserId: options.clerk.clerkUserId,
              absoluteExpiresAt: options.clerk.absoluteExpiresAt,
            }
          : {
              user: userId,
              expiration:
                options.expiration ||
                new Date(Date.now() + (options.expiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRY)),
            },
      );
      const refreshToken = await generateRefreshToken(currentSession, {
        dbSession: options.dbSession,
      });

      return { session: currentSession, refreshToken };
    } catch (error) {
      logger.error('[createSession] Error creating session:', error);
      throw new SessionError('Failed to create session', 'CREATE_SESSION_FAILED');
    }
  }

  /**
   * Finds a session by various parameters
   */
  async function findSession(
    params: t.SessionSearchParams,
    options: t.SessionQueryOptions = { lean: true },
  ): Promise<t.ISession | null> {
    try {
      const Session = mongoose.models.Session;
      const query: Record<string, unknown> = {};

      if (!params.refreshToken && !params.userId && !params.sessionId) {
        throw new SessionError(
          'At least one search parameter is required',
          'INVALID_SEARCH_PARAMS',
        );
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
          typeof params.sessionId === 'object' &&
          params.sessionId !== null &&
          'sessionId' in params.sessionId
            ? (params.sessionId as { sessionId: string }).sessionId
            : (params.sessionId as string);
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
          throw new SessionError('Invalid session ID format', 'INVALID_SESSION_ID');
        }
        query._id = sessionId;
      }

      if (params.tenantId) {
        query.tenantId = params.tenantId;
      }

      // Add expiration check to only return valid sessions, unless the caller
      // explicitly opts into seeing an already-expired session (e.g. to
      // identify and delete an expired Clerk Session at its absolute deadline).
      if (!options.includeExpired) {
        query.expiration = { $gt: new Date() };
      }

      const sessionQuery = Session.findOne(query);

      if (options.lean) {
        return (await sessionQuery.lean()) as t.ISession | null;
      }

      return await sessionQuery.exec();
    } catch (error) {
      logger.error('[findSession] Error finding session:', error);
      throw new SessionError('Failed to find session', 'FIND_SESSION_FAILED');
    }
  }

  /**
   * Updates session expiration
   */
  async function updateExpiration(
    session: t.ISession | string,
    newExpiration?: Date,
    options: t.UpdateExpirationOptions = {},
  ): Promise<t.ISession> {
    const expiresIn = options.expiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRY;

    try {
      const Session = mongoose.models.Session;
      const sessionDoc = typeof session === 'string' ? await Session.findById(session) : session;

      if (!sessionDoc) {
        throw new SessionError('Session not found', 'SESSION_NOT_FOUND');
      }

      sessionDoc.expiration = newExpiration || new Date(Date.now() + expiresIn);
      return await sessionDoc.save();
    } catch (error) {
      logger.error('[updateExpiration] Error updating session:', error);
      throw new SessionError('Failed to update session expiration', 'UPDATE_EXPIRATION_FAILED');
    }
  }

  /**
   * Deletes a session by refresh token or session ID
   */
  async function deleteSession(params: t.DeleteSessionParams): Promise<{ deletedCount?: number }> {
    try {
      const Session = mongoose.models.Session;
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
   * Deletes all sessions for a user
   */
  async function deleteAllUserSessions(
    userId: string | { userId: string },
    options: t.DeleteAllSessionsOptions = {},
  ): Promise<{ deletedCount?: number }> {
    try {
      const Session = mongoose.models.Session;
      if (!userId) {
        throw new SessionError('User ID is required', 'INVALID_USER_ID');
      }

      const userIdString =
        typeof userId === 'object' && userId !== null ? userId.userId : (userId as string);

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

  async function findClerkSessionIdsByClerkUserId(
    clerkUserId: string,
    options: t.ClerkSessionLifecycleOptions = {},
  ): Promise<readonly string[]> {
    const providerId = requireClerkIdentifier(clerkUserId);
    const query = sessionModel()
      .find({ clerkUserId: providerId, authProvider: 'clerk' })
      .select({ _id: 0, clerkSessionId: 1 });
    if (options.session) {
      query.session(options.session);
    }

    const sessions = await query.lean<Array<Pick<t.ISession, 'clerkSessionId'>>>();
    const sessionIds = sessions.flatMap((session) =>
      typeof session.clerkSessionId === 'string' ? [session.clerkSessionId] : [],
    );
    return [...new Set(sessionIds)].sort();
  }

  async function deleteSessionsByClerkSessionId(
    clerkSessionId: string,
    options: t.ClerkSessionLifecycleOptions = {},
  ): Promise<{ deletedCount?: number }> {
    const providerId = requireClerkIdentifier(clerkSessionId);
    return sessionModel().deleteMany(
      { clerkSessionId: providerId, authProvider: 'clerk' },
      { session: options.session },
    );
  }

  async function deleteSessionsByClerkUserId(
    clerkUserId: string,
    options: t.ClerkSessionLifecycleOptions = {},
  ): Promise<{ deletedCount?: number }> {
    const providerId = requireClerkIdentifier(clerkUserId);
    return sessionModel().deleteMany(
      { clerkUserId: providerId, authProvider: 'clerk' },
      { session: options.session },
    );
  }

  /**
   * Generates a refresh token for a session
   */
  async function generateRefreshToken(
    session: t.ISession,
    options: { dbSession?: import('mongoose').ClientSession } = {},
  ): Promise<string> {
    if (!session || !session.user) {
      throw new SessionError('Invalid session object', 'INVALID_SESSION');
    }

    try {
      const expiresIn = session.expiration
        ? session.expiration.getTime()
        : Date.now() + DEFAULT_REFRESH_TOKEN_EXPIRY;

      if (!session.expiration) {
        session.expiration = new Date(expiresIn);
      }

      /**
       * jsonwebtoken's `iat` claim is `floor(Date.now() / 1000)` at sign time,
       * so `exp = iat + expirationTime` only lands exactly on
       * `floor(expiresIn / 1000)` when expirationTime is computed the same
       * way: flooring each side to whole seconds before subtracting, not
       * flooring the millisecond difference. The latter is off by one
       * second whenever the deadline's millisecond remainder is smaller
       * than "now"'s.
       */
      const expirationTime = Math.max(
        0,
        Math.floor(expiresIn / 1000) - Math.floor(Date.now() / 1000),
      );

      const refreshToken = await signPayload({
        payload: {
          id: session.user,
          sessionId: session._id,
        },
        secret: process.env.JWT_REFRESH_SECRET!,
        expirationTime,
      });

      session.refreshTokenHash = await hashToken(refreshToken);
      await session.save({ session: options.dbSession });

      return refreshToken;
    } catch (error) {
      logger.error('[generateRefreshToken] Error generating refresh token:', error);
      throw new SessionError('Failed to generate refresh token', 'GENERATE_TOKEN_FAILED');
    }
  }

  /**
   * Counts active sessions for a user
   */
  async function countActiveSessions(userId: string): Promise<number> {
    try {
      const Session = mongoose.models.Session;
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
  }

  return {
    findSession,
    SessionError,
    deleteSession,
    createSession,
    updateExpiration,
    countActiveSessions,
    generateRefreshToken,
    deleteAllUserSessions,
    findClerkSessionIdsByClerkUserId,
    deleteSessionsByClerkSessionId,
    deleteSessionsByClerkUserId,
  };
}

export type SessionMethods = ReturnType<typeof createSessionMethods>;
