import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type * as t from '~/types';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createSessionMethods } from './session';
import { createUserMethods } from './user';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryReplSet;
let Session: mongoose.Model<t.ISession>;
let User: mongoose.Model<t.IUser>;
let methods: ReturnType<typeof createSessionMethods>;
let userMethods: ReturnType<typeof createUserMethods>;

function runAs<T>(tenantId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

async function createTestUser(): Promise<mongoose.Types.ObjectId> {
  const user = await User.create({
    email: `u-${new mongoose.Types.ObjectId()}@test.com`,
    provider: 'local',
  });
  return user._id as mongoose.Types.ObjectId;
}

function clerkSessionDoc(
  userId: mongoose.Types.ObjectId,
  overrides: Partial<t.ISession> = {},
): Partial<t.ISession> {
  const absoluteExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  return {
    user: userId,
    refreshTokenHash: 'hash',
    authProvider: 'clerk',
    clerkSessionId: 'sess_1',
    clerkTokenId: 'tok_1',
    clerkUserId: 'user_1',
    expiration: absoluteExpiresAt,
    absoluteExpiresAt,
    ...overrides,
  } as Partial<t.ISession>;
}

const originalJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

beforeAll(async () => {
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  Session = models.Session;
  User = models.User;
  methods = createSessionMethods(mongoose);
  userMethods = createUserMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
});

beforeEach(async () => {
  await Session.deleteMany({});
  await User.deleteMany({});
});

describe('Session Clerk correlation — discriminated validation', () => {
  test('a Clerk session with all correlation fields validates', async () => {
    const userId = await createTestUser();
    await expect(new Session(clerkSessionDoc(userId)).save()).resolves.toBeTruthy();
  });

  test.each(['clerkSessionId', 'clerkTokenId', 'clerkUserId'] as const)(
    'rejects a Clerk session missing "%s"',
    async (field) => {
      const userId = await createTestUser();
      const doc = clerkSessionDoc(userId);
      delete (doc as Record<string, unknown>)[field];
      await expect(new Session(doc).save()).rejects.toThrow(
        new RegExp(`require a non-blank "${field}"`),
      );
    },
  );

  test.each(['clerkSessionId', 'clerkTokenId', 'clerkUserId'] as const)(
    'rejects a Clerk session with a blank "%s"',
    async (field) => {
      const userId = await createTestUser();
      const doc = clerkSessionDoc(userId, { [field]: '   ' } as Partial<t.ISession>);
      await expect(new Session(doc).save()).rejects.toThrow(
        new RegExp(`require a non-blank "${field}"`),
      );
    },
  );

  test('rejects a Clerk session whose expiration does not equal absoluteExpiresAt', async () => {
    const userId = await createTestUser();
    const doc = clerkSessionDoc(userId, { expiration: new Date(Date.now() + 1000) });
    await expect(new Session(doc).save()).rejects.toThrow(
      /"expiration" must equal "absoluteExpiresAt"/,
    );
  });

  test('rejects a non-Clerk session that sets a Clerk-only field', async () => {
    const userId = await createTestUser();
    await expect(
      new Session({
        user: userId,
        refreshTokenHash: 'hash',
        expiration: new Date(Date.now() + 1000),
        clerkSessionId: 'sess_leaked',
      }).save(),
    ).rejects.toThrow(/non-Clerk sessions must not set "clerkSessionId"/);
  });

  test('a plain local session with no Clerk fields still validates', async () => {
    const userId = await createTestUser();
    await expect(
      new Session({
        user: userId,
        refreshTokenHash: 'hash',
        expiration: new Date(Date.now() + 1000),
      }).save(),
    ).resolves.toBeTruthy();
  });
});

describe('Session Clerk indexes', () => {
  test('rejects a duplicate clerkTokenId within the same tenant', async () => {
    await Session.syncIndexes();
    const userA = await createTestUser();
    await runAs('tenant-a', () => new Session(clerkSessionDoc(userA)).save());

    const userB = await createTestUser();
    await expect(
      runAs('tenant-a', () =>
        new Session(clerkSessionDoc(userB, { clerkSessionId: 'sess_2' })).save(),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  test('allows the same clerkTokenId in a different tenant', async () => {
    await Session.syncIndexes();
    const userA = await createTestUser();
    await runAs('tenant-a', () => new Session(clerkSessionDoc(userA)).save());

    const userB = await createTestUser();
    await expect(
      runAs('tenant-b', () => new Session(clerkSessionDoc(userB)).save()),
    ).resolves.toBeTruthy();
  });

  test('allows multiple sessions sharing the same clerkSessionId (cross-tab)', async () => {
    await Session.syncIndexes();
    const userId = await createTestUser();
    await runAs('tenant-a', () => new Session(clerkSessionDoc(userId)).save());

    await expect(
      runAs('tenant-a', () =>
        new Session(clerkSessionDoc(userId, { clerkTokenId: 'tok_2' })).save(),
      ),
    ).resolves.toBeTruthy();
  });
});

describe('Session Clerk system lifecycle methods', () => {
  async function saveClerkSession(
    tenantId: string,
    overrides: Partial<t.ISession>,
  ): Promise<t.ISession> {
    const userId = await createTestUser();
    return runAs(tenantId, () => new Session(clerkSessionDoc(userId, overrides)).save());
  }

  test('finds unique session IDs for a Clerk user across every tenant', async () => {
    await saveClerkSession('tenant-a', {
      clerkSessionId: 'sess_shared',
      clerkTokenId: 'tok_a',
      clerkUserId: 'user_target',
    });
    await saveClerkSession('tenant-b', {
      clerkSessionId: 'sess_shared',
      clerkTokenId: 'tok_b',
      clerkUserId: 'user_target',
    });
    await saveClerkSession('tenant-c', {
      clerkSessionId: 'sess_other',
      clerkTokenId: 'tok_c',
      clerkUserId: 'user_target',
    });
    await saveClerkSession('tenant-a', {
      clerkSessionId: 'sess_unrelated',
      clerkTokenId: 'tok_d',
      clerkUserId: 'user_other',
    });

    const sessionIds = await runAs('forged-tenant', () =>
      runAsSystem(() => methods.findClerkSessionIdsByClerkUserId('user_target')),
    );

    expect(sessionIds).toEqual(['sess_other', 'sess_shared']);
  });

  test('deletes every Session correlated to a sid across tenants in one transaction', async () => {
    await saveClerkSession('tenant-a', {
      clerkSessionId: 'sess_target',
      clerkTokenId: 'tok_a',
      clerkUserId: 'user_a',
    });
    await saveClerkSession('tenant-b', {
      clerkSessionId: 'sess_target',
      clerkTokenId: 'tok_b',
      clerkUserId: 'user_b',
    });
    await saveClerkSession('tenant-b', {
      clerkSessionId: 'sess_keep',
      clerkTokenId: 'tok_c',
      clerkUserId: 'user_b',
    });
    const transaction = await mongoose.startSession();

    try {
      await runAs('forged-tenant', () =>
        runAsSystem(() =>
          transaction.withTransaction(() =>
            methods.deleteSessionsByClerkSessionId('sess_target', { session: transaction }),
          ),
        ),
      );
    } finally {
      await transaction.endSession();
    }

    const remaining = await runAsSystem(() => Session.find().select({ clerkSessionId: 1 }).lean());
    expect(remaining.map((session) => session.clerkSessionId)).toEqual(['sess_keep']);
  });

  test('deletes every Session correlated to a Clerk user while preserving other users', async () => {
    await saveClerkSession('tenant-a', {
      clerkSessionId: 'sess_a',
      clerkTokenId: 'tok_a',
      clerkUserId: 'user_target',
    });
    await saveClerkSession('tenant-b', {
      clerkSessionId: 'sess_b',
      clerkTokenId: 'tok_b',
      clerkUserId: 'user_target',
    });
    await saveClerkSession('tenant-b', {
      clerkSessionId: 'sess_keep',
      clerkTokenId: 'tok_c',
      clerkUserId: 'user_other',
    });
    const transaction = await mongoose.startSession();

    try {
      await runAsSystem(() =>
        transaction.withTransaction(() =>
          methods.deleteSessionsByClerkUserId('user_target', { session: transaction }),
        ),
      );
    } finally {
      await transaction.endSession();
    }

    const remaining = await runAsSystem(() => Session.find().select({ clerkUserId: 1 }).lean());
    expect(remaining.map((session) => session.clerkUserId)).toEqual(['user_other']);
  });

  test('participates in caller-owned rollback without deleting correlated Sessions', async () => {
    await saveClerkSession('tenant-a', {
      clerkSessionId: 'sess_target',
      clerkTokenId: 'tok_a',
      clerkUserId: 'user_target',
    });
    const transaction = await mongoose.startSession();

    try {
      await expect(
        runAsSystem(() =>
          transaction.withTransaction(async () => {
            await methods.deleteSessionsByClerkSessionId('sess_target', {
              session: transaction,
            });
            throw new Error('abort transaction');
          }),
        ),
      ).rejects.toThrow('abort transaction');
    } finally {
      await transaction.endSession();
    }

    await expect(
      runAsSystem(() => Session.countDocuments({ clerkSessionId: 'sess_target' })),
    ).resolves.toBe(1);
  });

  test.each<[string, () => Promise<unknown>]>([
    ['findClerkSessionIdsByClerkUserId', () => methods.findClerkSessionIdsByClerkUserId('   ')],
    ['deleteSessionsByClerkSessionId', () => methods.deleteSessionsByClerkSessionId('')],
    ['deleteSessionsByClerkUserId', () => methods.deleteSessionsByClerkUserId('   ')],
  ])('rejects a blank provider identifier in %s', async (_name, operation) => {
    await expect(runAsSystem(operation)).rejects.toMatchObject({ code: 'INVALID_CLERK_ID' });
  });
});

describe('createSession with a Clerk correlation context', () => {
  function clerkContext(overrides: Partial<t.ClerkSessionContext> = {}): t.ClerkSessionContext {
    const absoluteExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return {
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
      clerkSessionId: 'sess_create',
      clerkTokenId: 'tok_create',
      clerkUserId: 'user_create',
      tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      absoluteExpiresAt,
      ...overrides,
    };
  }

  test('populates correlation fields and sets expiration to absoluteExpiresAt', async () => {
    const userId = await createTestUser();
    const clerk = clerkContext();

    const { session } = await runAs('tenant-a', () =>
      methods.createSession(userId.toString(), { clerk }),
    );

    expect(session.authProvider).toBe('clerk');
    expect(session.clerkSessionId).toBe(clerk.clerkSessionId);
    expect(session.clerkTokenId).toBe(clerk.clerkTokenId);
    expect(session.clerkUserId).toBe(clerk.clerkUserId);
    expect(session.expiration?.getTime()).toBe(clerk.absoluteExpiresAt.getTime());
    expect(session.absoluteExpiresAt?.getTime()).toBe(clerk.absoluteExpiresAt.getTime());
  });

  test('persists the tenantId onto the Clerk session document', async () => {
    const userId = await createTestUser();
    const clerk = clerkContext();

    const { session } = await runAs('tenant-a', () =>
      methods.createSession(userId.toString(), { clerk }),
    );

    const persisted = await runAsSystem(() =>
      Session.findById(session._id).select('+tenantId').lean(),
    );
    expect(persisted?.tenantId).toBe('tenant-a');
  });

  test('participates in a caller-owned transaction via dbSession and rolls back with it', async () => {
    const userId = await createTestUser();
    const clerk = clerkContext({ clerkSessionId: 'sess_rollback' });
    const transaction = await mongoose.startSession();

    try {
      await expect(
        runAs('tenant-a', () =>
          runAsSystem(() =>
            transaction.withTransaction(async () => {
              await methods.createSession(userId.toString(), { clerk, dbSession: transaction });
              throw new Error('abort transaction');
            }),
          ),
        ),
      ).rejects.toThrow('abort transaction');
    } finally {
      await transaction.endSession();
    }

    await expect(
      runAsSystem(() => Session.countDocuments({ clerkSessionId: 'sess_rollback' })),
    ).resolves.toBe(0);
  });

  test('a Clerk session created via dbSession is visible after commit', async () => {
    const userId = await createTestUser();
    const clerk = clerkContext({ clerkSessionId: 'sess_committed' });
    const transaction = await mongoose.startSession();

    try {
      await runAs('tenant-a', () =>
        runAsSystem(() =>
          transaction.withTransaction(() =>
            methods.createSession(userId.toString(), { clerk, dbSession: transaction }),
          ),
        ),
      );
    } finally {
      await transaction.endSession();
    }

    await expect(
      runAsSystem(() => Session.countDocuments({ clerkSessionId: 'sess_committed' })),
    ).resolves.toBe(1);
  });
});

describe('findUser transaction participation', () => {
  test('a User inserted inside an uncommitted transaction is invisible outside it', async () => {
    const transaction = await mongoose.startSession();
    let insertedId: mongoose.Types.ObjectId | undefined;

    try {
      await transaction.withTransaction(async () => {
        const [user] = await User.create(
          [{ email: `tx-${new mongoose.Types.ObjectId()}@test.com`, provider: 'local' }],
          { session: transaction },
        );
        insertedId = user._id as mongoose.Types.ObjectId;

        const foundInside = await runAsSystem(() =>
          userMethods.findUser({ _id: insertedId }, null, { session: transaction }),
        );
        expect(foundInside).not.toBeNull();

        const foundOutside = await runAsSystem(() => userMethods.findUser({ _id: insertedId }));
        expect(foundOutside).toBeNull();

        throw new Error('abort transaction');
      });
    } catch {
      // expected — aborts the transaction
    } finally {
      await transaction.endSession();
    }

    const afterAbort = await runAsSystem(() => userMethods.findUser({ _id: insertedId }));
    expect(afterAbort).toBeNull();
  });

  test('excludes a tombstoned User when criteria requires clerkDeletedAt to not exist', async () => {
    const user = await User.create({
      email: `tombstoned-${new mongoose.Types.ObjectId()}@test.com`,
      provider: 'clerk',
      clerkId: 'clerk_tombstoned',
      clerkDeletedAt: new Date(),
    });

    const found = await runAsSystem(() =>
      userMethods.findUser({ _id: user._id, clerkDeletedAt: { $exists: false } }),
    );
    expect(found).toBeNull();
  });
});

describe('findSession includeExpired', () => {
  test('omits an expired Clerk Session by default', async () => {
    const userId = await createTestUser();
    const expired = await runAs('tenant-a', () =>
      new Session(
        clerkSessionDoc(userId, {
          clerkSessionId: 'sess_expired',
          expiration: new Date(Date.now() - 1000),
          absoluteExpiresAt: new Date(Date.now() - 1000),
        }),
      ).save(),
    );

    const found = await runAsSystem(() =>
      methods.findSession({ sessionId: expired._id.toString() }),
    );
    expect(found).toBeNull();
  });

  test('returns an expired Clerk Session when includeExpired is true', async () => {
    const userId = await createTestUser();
    const expired = await runAs('tenant-a', () =>
      new Session(
        clerkSessionDoc(userId, {
          clerkSessionId: 'sess_expired_included',
          expiration: new Date(Date.now() - 1000),
          absoluteExpiresAt: new Date(Date.now() - 1000),
        }),
      ).save(),
    );

    const found = await runAsSystem(() =>
      methods.findSession(
        { sessionId: expired._id.toString() },
        { lean: false, includeExpired: true },
      ),
    );
    expect(found?.clerkSessionId).toBe('sess_expired_included');
  });

  test('still returns a live (non-expired) session when includeExpired is true', async () => {
    const userId = await createTestUser();
    const live = await runAs('tenant-a', () => new Session(clerkSessionDoc(userId)).save());

    const found = await runAsSystem(() =>
      methods.findSession({ sessionId: live._id.toString() }, { includeExpired: true }),
    );
    expect(found?.clerkSessionId).toBe(live.clerkSessionId);
  });
});

describe('findSession explicit tenant suffix', () => {
  test('confirms a Clerk Session when the tenantId matches', async () => {
    const userId = await createTestUser();
    const created = await runAs('tenant-a', () =>
      new Session(clerkSessionDoc(userId, { clerkSessionId: 'sess_confirm' })).save(),
    );

    const found = await runAsSystem(() =>
      methods.findSession({ sessionId: created._id.toString(), tenantId: 'tenant-a' }),
    );
    expect(found?.clerkSessionId).toBe('sess_confirm');
  });

  test('returns null when the tenantId does not match the Session', async () => {
    const userId = await createTestUser();
    const created = await runAs('tenant-a', () =>
      new Session(clerkSessionDoc(userId, { clerkSessionId: 'sess_wrong_tenant' })).save(),
    );

    const found = await runAsSystem(() =>
      methods.findSession({ sessionId: created._id.toString(), tenantId: 'tenant-b' }),
    );
    expect(found).toBeNull();
  });
});

describe('generateRefreshToken JWT deadline', () => {
  test.each([1, 100, 250, 499, 500, 501, 750, 999, 1001, 60437, 123456])(
    'signs a refresh token whose exp matches floor(session.expiration / 1000) for a %ims-offset deadline',
    async (offsetMs) => {
      const userId = await createTestUser();
      const session = new Session(
        clerkSessionDoc(userId, {
          clerkSessionId: `sess_refresh_${offsetMs}`,
          expiration: new Date(Date.now() + offsetMs),
          absoluteExpiresAt: new Date(Date.now() + offsetMs),
        }),
      );

      const refreshToken = await methods.generateRefreshToken(session);
      const decoded = jwt.decode(refreshToken);
      if (decoded === null || typeof decoded === 'string') {
        throw new Error('Expected a decoded JWT payload object');
      }

      expect(decoded.exp).toBe(Math.floor(session.expiration.getTime() / 1000));
    },
  );
});
