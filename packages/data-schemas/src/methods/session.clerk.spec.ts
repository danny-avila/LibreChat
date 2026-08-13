import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type * as t from '~/types';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createSessionMethods } from './session';
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

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  Session = models.Session;
  User = models.User;
  methods = createSessionMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
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

  test.each([
    ['findClerkSessionIdsByClerkUserId', () => methods.findClerkSessionIdsByClerkUserId('   ')],
    ['deleteSessionsByClerkSessionId', () => methods.deleteSessionsByClerkSessionId('')],
    ['deleteSessionsByClerkUserId', () => methods.deleteSessionsByClerkUserId('   ')],
  ])('rejects a blank provider identifier in %s', async (_name, operation) => {
    await expect(runAsSystem(operation)).rejects.toMatchObject({ code: 'INVALID_CLERK_ID' });
  });
});
