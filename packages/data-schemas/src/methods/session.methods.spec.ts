import mongoose from 'mongoose';
import { createSessionMethods, ACTIVE_SESSION_EXISTS_CODE } from './session';
import { signPayload, hashToken } from '~/crypto';

jest.mock('~/crypto', () => ({
  signPayload: jest.fn(({ payload }) => Promise.resolve(`refresh-${payload.sessionId}`)),
  hashToken: jest.fn((token: string) => Promise.resolve(`hash-${token}`)),
}));

type StoredSession = {
  _id: mongoose.Types.ObjectId;
  user: string;
  expiration: Date;
  refreshTokenHash?: string;
  save: () => Promise<StoredSession>;
};

describe('Session Methods - single active session lock', () => {
  let sessions: StoredSession[];
  let user: {
    _id: string;
    activeSessionId?: mongoose.Types.ObjectId | string;
    activeSessionExpiresAt?: Date;
  };
  let methods: ReturnType<typeof createSessionMethods>;

  function sessionMatchesQuery(session: StoredSession, query: Record<string, any>) {
    if (query.user && session.user !== query.user) {
      return false;
    }
    if (query._id && session._id.toString() !== query._id.toString()) {
      return false;
    }
    if (query.refreshTokenHash && session.refreshTokenHash !== query.refreshTokenHash) {
      return false;
    }
    if (query.expiration?.$gt && session.expiration <= query.expiration.$gt) {
      return false;
    }
    return true;
  }

  function canClaim(filter: Record<string, any>) {
    if (filter._id !== user._id) {
      return false;
    }
    return filter.$or.some((condition: Record<string, any>) => {
      if (condition.activeSessionId?.$exists === false) {
        return user.activeSessionId === undefined;
      }
      if (condition.activeSessionId === null) {
        return user.activeSessionId === null;
      }
      if (condition.activeSessionExpiresAt?.$lte) {
        return (
          user.activeSessionExpiresAt != null &&
          user.activeSessionExpiresAt <= condition.activeSessionExpiresAt.$lte
        );
      }
      return false;
    });
  }

  function applyUserUpdate(update: Record<string, any>) {
    if (update.$set) {
      Object.assign(user, update.$set);
    }
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        delete user[key as keyof typeof user];
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessions = [];
    user = { _id: new mongoose.Types.ObjectId().toString() };

    class SessionModel {
      _id: mongoose.Types.ObjectId;
      user: string;
      expiration: Date;
      refreshTokenHash?: string;

      constructor(data: { user: string; expiration: Date }) {
        this._id = new mongoose.Types.ObjectId();
        this.user = data.user;
        this.expiration = data.expiration;
      }

      async save() {
        const existingIndex = sessions.findIndex(
          (session) => session._id.toString() === this._id.toString(),
        );
        if (existingIndex === -1) {
          sessions.push(this as StoredSession);
        } else {
          sessions[existingIndex] = this as StoredSession;
        }
        return this;
      }

      static findOne(query: Record<string, any>) {
        return {
          lean: async () => sessions.find((session) => sessionMatchesQuery(session, query)) ?? null,
        };
      }

      static findOneAndDelete(query: Record<string, any>) {
        return {
          lean: async () => {
            const index = sessions.findIndex((session) => sessionMatchesQuery(session, query));
            if (index === -1) {
              return null;
            }
            const [deletedSession] = sessions.splice(index, 1);
            return deletedSession;
          },
        };
      }

      static async countDocuments(query: Record<string, any>) {
        return sessions.filter((session) => sessionMatchesQuery(session, query)).length;
      }

      static async deleteMany(query: Record<string, any>) {
        const before = sessions.length;
        sessions = sessions.filter((session) => !sessionMatchesQuery(session, query));
        return { deletedCount: before - sessions.length };
      }
    }

    const UserModel = {
      updateOne: jest.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
        const activeSessionMatches =
          filter.activeSessionId == null ||
          user.activeSessionId?.toString() === filter.activeSessionId.toString();
        if (filter._id === user._id && activeSessionMatches) {
          applyUserUpdate(update);
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      }),
      findOneAndUpdate: jest.fn((filter: Record<string, any>, update: Record<string, any>) => ({
        lean: async () => {
          if (!canClaim(filter)) {
            return null;
          }
          applyUserUpdate(update);
          return user;
        },
      })),
    };

    methods = createSessionMethods({
      models: {
        Session: SessionModel,
        User: UserModel,
      },
      Types: mongoose.Types,
    } as unknown as typeof mongoose);
  });

  test('should reject a second active session for the same user', async () => {
    const firstSession = await methods.createSession(user._id);

    await expect(methods.createSession(user._id)).rejects.toMatchObject({
      code: ACTIVE_SESSION_EXISTS_CODE,
      message: 'You are already logged in on one device. Logout to access in this device.',
    });

    expect(user.activeSessionId?.toString()).toBe(firstSession.session._id?.toString());
    expect(sessions).toHaveLength(1);
  });

  test('should release the active session lock when the session is deleted', async () => {
    const firstSession = await methods.createSession(user._id);

    await methods.deleteSession({ sessionId: firstSession.session._id?.toString() });
    const secondSession = await methods.createSession(user._id);

    expect(secondSession.refreshToken).toBe(`refresh-${secondSession.session._id}`);
    expect(user.activeSessionId?.toString()).toBe(secondSession.session._id?.toString());
    expect(sessions).toHaveLength(1);
  });

  test('should allow only one winner for concurrent session creation attempts', async () => {
    const results = await Promise.allSettled([
      methods.createSession(user._id),
      methods.createSession(user._id),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(ACTIVE_SESSION_EXISTS_CODE);
    expect(sessions).toHaveLength(1);
  });

  test('should release the lock if session token generation fails', async () => {
    (signPayload as jest.MockedFunction<typeof signPayload>).mockRejectedValueOnce(
      new Error('signing failed'),
    );

    await expect(methods.createSession(user._id)).rejects.toMatchObject({
      code: 'GENERATE_TOKEN_FAILED',
      message: 'Failed to generate refresh token',
    });

    expect(user.activeSessionId).toBeUndefined();
    expect(sessions).toHaveLength(0);
    expect(hashToken).not.toHaveBeenCalled();
  });
});
