import type { ClerkSessionMongoSession, ClerkSessionPersistenceMethods } from './persistence';
import type { PersistClerkSessionInput, PersistedClerkSession } from './session';
import {
  CLERK_SESSION_TRANSACTION_TIMEOUT_MS,
  createMongooseClerkSessionPersistence,
} from './persistence';
import { ClerkRouteError } from './handler';

const now = new Date('2026-08-13T12:00:00.000Z');
const claimExpiresAt = new Date('2026-08-13T12:10:05.000Z');
const absoluteExpiresAt = new Date('2026-08-13T12:15:00.000Z');
const clerk = {
  authProvider: 'clerk' as const,
  tenantScope: 'tenant-a',
  clerkSessionId: 'sess_clerk',
  clerkTokenId: 'token_clerk',
  clerkUserId: 'user_clerk',
  tokenExpiresAt: new Date('2026-08-13T12:10:00.000Z'),
  absoluteExpiresAt,
};
const persistedSession: PersistedClerkSession & {
  authProvider: 'clerk';
  tenantId?: string;
  absoluteExpiresAt: Date;
} = {
  _id: 'session-id',
  authProvider: 'clerk',
  tenantId: 'tenant-a',
  expiration: absoluteExpiresAt,
  absoluteExpiresAt,
};
const persistInput: PersistClerkSessionInput = {
  userId: 'user-id',
  tenantId: 'tenant-a',
  clerk,
  claimExpiresAt,
};

interface TestTransaction extends ClerkSessionMongoSession {
  withTransaction: jest.Mock;
  endSession: jest.Mock;
}

function setup() {
  const transaction: TestTransaction = {
    withTransaction: jest.fn(async (operation: () => Promise<unknown>) => operation()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const methods: ClerkSessionPersistenceMethods<TestTransaction> = {
    findUser: jest.fn().mockResolvedValue({ _id: 'user-id' }),
    upsertUserState: jest.fn().mockResolvedValue(undefined),
    upsertSessionState: jest.fn().mockResolvedValue(undefined),
    insertConsumedTokenClaim: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({
      session: persistedSession,
      refreshToken: 'transaction-refresh-token',
    }),
    findSession: jest.fn().mockResolvedValue(persistedSession),
    deleteSession: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
  const startSession = jest.fn().mockResolvedValue(transaction);
  const persistence = createMongooseClerkSessionPersistence({
    startSession,
    methods,
    now: () => now,
  });
  return { methods, persistence, startSession, transaction };
}

describe('createMongooseClerkSessionPersistence', () => {
  it('owns one bounded Mongo transaction and forwards the same session to every write', async () => {
    const { methods, persistence, startSession, transaction } = setup();

    await expect(persistence.persistClerkSession(persistInput)).resolves.toBe(persistedSession);

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(transaction.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      timeoutMS: CLERK_SESSION_TRANSACTION_TIMEOUT_MS,
    });
    expect(methods.findUser).toHaveBeenCalledWith(
      {
        _id: 'user-id',
        clerkId: 'user_clerk',
        clerkDeletedAt: { $exists: false },
        tenantId: 'tenant-a',
      },
      null,
      { session: transaction },
    );
    expect(methods.upsertUserState).toHaveBeenCalledWith(
      {
        clerkUserId: 'user_clerk',
        state: 'active',
        expiration: claimExpiresAt,
      },
      { session: transaction },
    );
    expect(methods.upsertSessionState).toHaveBeenCalledWith(
      {
        clerkSessionId: 'sess_clerk',
        state: 'active',
        expiration: claimExpiresAt,
      },
      { session: transaction },
    );
    expect(methods.insertConsumedTokenClaim).toHaveBeenCalledWith(
      {
        tenantScope: 'tenant-a',
        clerkTokenId: 'token_clerk',
        sourceClerkSessionId: 'sess_clerk',
        sourceClerkUserId: 'user_clerk',
        expiration: claimExpiresAt,
      },
      { session: transaction },
    );
    expect(methods.createSession).toHaveBeenCalledWith('user-id', {
      clerk,
      dbSession: transaction,
    });
    expect(transaction.endSession).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit tenantless suffix in the transactional User check', async () => {
    const { methods, persistence } = setup();

    await persistence.persistClerkSession({
      ...persistInput,
      tenantId: undefined,
      clerk: { ...clerk, tenantScope: '__CLERK_TENANTLESS__' },
    });

    expect(methods.findUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: { $exists: false } }),
      null,
      expect.any(Object),
    );
  });

  it('fails closed before fences, claims, or Session writes when the User is absent/tombstoned', async () => {
    const { methods, persistence, transaction } = setup();
    jest.mocked(methods.findUser).mockResolvedValue(null);

    await expect(persistence.persistClerkSession(persistInput)).rejects.toMatchObject<
      Partial<ClerkRouteError>
    >({
      code: 'CLERK_LOGIN_FORBIDDEN',
      status: 403,
    });

    expect(methods.upsertUserState).not.toHaveBeenCalled();
    expect(methods.upsertSessionState).not.toHaveBeenCalled();
    expect(methods.insertConsumedTokenClaim).not.toHaveBeenCalled();
    expect(methods.createSession).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledTimes(1);
  });

  it('ends the Mongo session and preserves a named claim error when the transaction aborts', async () => {
    const { methods, persistence, transaction } = setup();
    const replay = Object.assign(new Error('duplicate durable claim'), {
      code: 'CLERK_TOKEN_REPLAYED',
    });
    jest.mocked(methods.insertConsumedTokenClaim).mockRejectedValue(replay);

    await expect(persistence.persistClerkSession(persistInput)).rejects.toBe(replay);
    expect(transaction.endSession).toHaveBeenCalledTimes(1);
  });

  it('confirms only a live Clerk Session in the exact tenant after commit', async () => {
    const { methods, persistence } = setup();

    await expect(
      persistence.confirmClerkSession({ sessionId: 'session-id', tenantId: 'tenant-a' }),
    ).resolves.toBe(true);

    expect(methods.findSession).toHaveBeenCalledWith(
      { sessionId: 'session-id', tenantId: 'tenant-a' },
      { lean: true, includeExpired: true },
    );

    jest.mocked(methods.findSession).mockResolvedValueOnce({
      ...persistedSession,
      tenantId: 'tenant-b',
    });
    await expect(
      persistence.confirmClerkSession({ sessionId: 'session-id', tenantId: 'tenant-a' }),
    ).resolves.toBe(false);

    jest.mocked(methods.findSession).mockResolvedValueOnce({
      ...persistedSession,
      expiration: now,
      absoluteExpiresAt: now,
    });
    await expect(
      persistence.confirmClerkSession({ sessionId: 'session-id', tenantId: 'tenant-a' }),
    ).resolves.toBe(false);
  });

  it('deletes only the exact committed Session ID during compensation', async () => {
    const { methods, persistence } = setup();

    await persistence.deleteSession('session-id');

    expect(methods.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-id' });
  });
});
