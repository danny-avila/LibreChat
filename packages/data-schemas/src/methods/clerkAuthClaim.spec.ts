import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type * as t from '~/types';
import {
  createClerkAuthClaimMethods,
  ClerkAuthClaimError,
  toClerkTenantScope,
} from './clerkAuthClaim';
import { CLERK_TENANTLESS_SCOPE } from '~/types';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryReplSet;
let ClerkAuthClaim: mongoose.Model<t.IClerkAuthClaim>;
let methods: ReturnType<typeof createClerkAuthClaimMethods>;

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  ClerkAuthClaim = models.ClerkAuthClaim;
  methods = createClerkAuthClaimMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await ClerkAuthClaim.deleteMany({});
});

describe('toClerkTenantScope', () => {
  test('returns the tenant ID when present', () => {
    expect(toClerkTenantScope('tenant-a')).toBe('tenant-a');
  });

  test('returns the tenantless sentinel when absent', () => {
    expect(toClerkTenantScope(undefined)).toBe(CLERK_TENANTLESS_SCOPE);
    expect(toClerkTenantScope(null)).toBe(CLERK_TENANTLESS_SCOPE);
    expect(toClerkTenantScope('')).toBe(CLERK_TENANTLESS_SCOPE);
    expect(toClerkTenantScope('   ')).toBe(CLERK_TENANTLESS_SCOPE);
  });
});

describe('ClerkAuthClaim discriminated validation', () => {
  test('accepts a well-formed consumed_token claim', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'consumed_token',
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_1',
        sourceClerkSessionId: 'sess_1',
        sourceClerkUserId: 'user_1',
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).resolves.toBeTruthy();
  });

  test('rejects a consumed_token claim missing a required field', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'consumed_token',
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_1',
        sourceClerkSessionId: 'sess_1',
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).rejects.toThrow(/require a non-blank "sourceClerkUserId"/);
  });

  test('rejects a consumed_token claim with a cross-shape field', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'consumed_token',
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_1',
        sourceClerkSessionId: 'sess_1',
        sourceClerkUserId: 'user_1',
        clerkUserId: 'user_leaked',
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).rejects.toThrow(/must not set "clerkUserId"/);
  });

  test('accepts an active session_state claim', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'session_state',
        clerkSessionId: 'sess_1',
        state: 'active',
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).resolves.toBeTruthy();
  });

  test('rejects an active session_state claim that sets revokedAt', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'session_state',
        clerkSessionId: 'sess_1',
        state: 'active',
        revokedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).rejects.toThrow(/must not set "revokedAt"/);
  });

  test('rejects a revoked session_state claim missing revokedAt', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'session_state',
        clerkSessionId: 'sess_1',
        state: 'revoked',
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).rejects.toThrow(/require "revokedAt"/);
  });

  test('accepts a deleted user_state claim with deletedAt', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'user_state',
        clerkUserId: 'user_1',
        state: 'deleted',
        deletedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      }).save(),
    ).resolves.toBeTruthy();
  });

  test('rejects an unknown kind', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'not_a_real_kind',
        expiration: new Date(Date.now() + HOUR),
      } as unknown as Partial<t.IClerkAuthClaim>).save(),
    ).rejects.toThrow();
  });

  test('rejects a missing expiration', async () => {
    await expect(
      new ClerkAuthClaim({
        kind: 'user_state',
        clerkUserId: 'user_1',
        state: 'active',
      }).save(),
    ).rejects.toThrow();
  });
});

describe('ClerkAuthClaim indexes', () => {
  test('rejects a duplicate consumed_token within the same tenantScope', async () => {
    await ClerkAuthClaim.syncIndexes();
    await ClerkAuthClaim.create({
      kind: 'consumed_token',
      tenantScope: 'tenant-a',
      clerkTokenId: 'tok_dup',
      sourceClerkSessionId: 'sess_1',
      sourceClerkUserId: 'user_1',
      expiration: new Date(Date.now() + HOUR),
    });

    await expect(
      ClerkAuthClaim.create({
        kind: 'consumed_token',
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_dup',
        sourceClerkSessionId: 'sess_2',
        sourceClerkUserId: 'user_2',
        expiration: new Date(Date.now() + HOUR),
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  test('allows the same clerkTokenId in a different tenantScope', async () => {
    await ClerkAuthClaim.syncIndexes();
    await ClerkAuthClaim.create({
      kind: 'consumed_token',
      tenantScope: 'tenant-a',
      clerkTokenId: 'tok_shared',
      sourceClerkSessionId: 'sess_1',
      sourceClerkUserId: 'user_1',
      expiration: new Date(Date.now() + HOUR),
    });

    await expect(
      ClerkAuthClaim.create({
        kind: 'consumed_token',
        tenantScope: 'tenant-b',
        clerkTokenId: 'tok_shared',
        sourceClerkSessionId: 'sess_1',
        sourceClerkUserId: 'user_1',
        expiration: new Date(Date.now() + HOUR),
      }),
    ).resolves.toBeTruthy();
  });

  test('rejects a duplicate clerkSessionId session_state claim', async () => {
    await ClerkAuthClaim.syncIndexes();
    await ClerkAuthClaim.create({
      kind: 'session_state',
      clerkSessionId: 'sess_dup',
      state: 'active',
      expiration: new Date(Date.now() + HOUR),
    });

    await expect(
      ClerkAuthClaim.create({
        kind: 'session_state',
        clerkSessionId: 'sess_dup',
        state: 'active',
        expiration: new Date(Date.now() + HOUR),
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  test('rejects a duplicate clerkUserId user_state claim', async () => {
    await ClerkAuthClaim.syncIndexes();
    await ClerkAuthClaim.create({
      kind: 'user_state',
      clerkUserId: 'user_dup',
      state: 'active',
      expiration: new Date(Date.now() + HOUR),
    });

    await expect(
      ClerkAuthClaim.create({
        kind: 'user_state',
        clerkUserId: 'user_dup',
        state: 'active',
        expiration: new Date(Date.now() + HOUR),
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('ClerkAuthClaim methods', () => {
  describe('insertConsumedTokenClaim', () => {
    test('creates a claim and maps a replay to a stable error', async () => {
      const input = {
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_1',
        sourceClerkSessionId: 'sess_1',
        sourceClerkUserId: 'user_1',
        expiration: new Date(Date.now() + HOUR),
      };
      await expect(methods.insertConsumedTokenClaim(input)).resolves.toBeTruthy();

      await expect(methods.insertConsumedTokenClaim(input)).rejects.toMatchObject({
        code: 'CLERK_TOKEN_REPLAYED',
      });
      await expect(methods.insertConsumedTokenClaim(input)).rejects.toBeInstanceOf(
        ClerkAuthClaimError,
      );
    });
  });

  describe('findConsumedTokenClaim', () => {
    test('finds an inserted claim by exact tenantScope + clerkTokenId', async () => {
      await methods.insertConsumedTokenClaim({
        tenantScope: 'tenant-a',
        clerkTokenId: 'tok_findme',
        sourceClerkSessionId: 'sess_1',
        sourceClerkUserId: 'user_1',
        expiration: new Date(Date.now() + HOUR),
      });

      const found = await methods.findConsumedTokenClaim('tenant-a', 'tok_findme');
      expect(found).toBeTruthy();
      expect(found?.sourceClerkSessionId).toBe('sess_1');

      expect(await methods.findConsumedTokenClaim('tenant-b', 'tok_findme')).toBeNull();
    });
  });

  describe('upsertSessionState / findSessionState', () => {
    test('creates an active state and transitions it to revoked', async () => {
      await methods.upsertSessionState({
        clerkSessionId: 'sess_x',
        state: 'active',
        expiration: new Date(Date.now() + HOUR),
      });
      expect((await methods.findSessionState('sess_x'))?.state).toBe('active');

      await methods.upsertSessionState({
        clerkSessionId: 'sess_x',
        state: 'revoked',
        revokedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      });
      const revoked = await methods.findSessionState('sess_x');
      expect(revoked?.state).toBe('revoked');
      expect(revoked?.revokedAt).toBeInstanceOf(Date);
    });

    test('a revoked session cannot be resurrected to active', async () => {
      await methods.upsertSessionState({
        clerkSessionId: 'sess_y',
        state: 'revoked',
        revokedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      });

      await expect(
        methods.upsertSessionState({
          clerkSessionId: 'sess_y',
          state: 'active',
          expiration: new Date(Date.now() + HOUR),
        }),
      ).rejects.toMatchObject({ code: 'CLERK_SESSION_REVOKED' });

      expect((await methods.findSessionState('sess_y'))?.state).toBe('revoked');
    });

    test('a later active upsert with a shorter expiration never shrinks the fence', async () => {
      const longExpiration = new Date(Date.now() + HOUR);
      const shortExpiration = new Date(Date.now() + 60_000);

      await methods.upsertSessionState({
        clerkSessionId: 'sess_z',
        state: 'active',
        expiration: longExpiration,
      });
      await methods.upsertSessionState({
        clerkSessionId: 'sess_z',
        state: 'active',
        expiration: shortExpiration,
      });

      const claim = await methods.findSessionState('sess_z');
      expect(claim?.expiration.getTime()).toBe(longExpiration.getTime());
    });

    test('a later active upsert with a longer expiration extends the fence', async () => {
      const shortExpiration = new Date(Date.now() + 60_000);
      const longExpiration = new Date(Date.now() + HOUR);

      await methods.upsertSessionState({
        clerkSessionId: 'sess_w',
        state: 'active',
        expiration: shortExpiration,
      });
      await methods.upsertSessionState({
        clerkSessionId: 'sess_w',
        state: 'active',
        expiration: longExpiration,
      });

      const claim = await methods.findSessionState('sess_w');
      expect(claim?.expiration.getTime()).toBe(longExpiration.getTime());
    });
  });

  describe('upsertUserState / findUserState', () => {
    test('creates an active state and transitions it to deleted', async () => {
      await methods.upsertUserState({
        clerkUserId: 'user_x',
        state: 'active',
        expiration: new Date(Date.now() + HOUR),
      });
      expect((await methods.findUserState('user_x'))?.state).toBe('active');

      await methods.upsertUserState({
        clerkUserId: 'user_x',
        state: 'deleted',
        deletedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      });
      const deleted = await methods.findUserState('user_x');
      expect(deleted?.state).toBe('deleted');
      expect(deleted?.deletedAt).toBeInstanceOf(Date);
    });

    test('a deleted user cannot be resurrected to active', async () => {
      await methods.upsertUserState({
        clerkUserId: 'user_y',
        state: 'deleted',
        deletedAt: new Date(),
        expiration: new Date(Date.now() + HOUR),
      });

      await expect(
        methods.upsertUserState({
          clerkUserId: 'user_y',
          state: 'active',
          expiration: new Date(Date.now() + HOUR),
        }),
      ).rejects.toMatchObject({ code: 'CLERK_USER_DELETED' });

      expect((await methods.findUserState('user_y'))?.state).toBe('deleted');
    });

    test('a later active upsert with a shorter expiration never shrinks the fence', async () => {
      const longExpiration = new Date(Date.now() + HOUR);
      const shortExpiration = new Date(Date.now() + 60_000);

      await methods.upsertUserState({
        clerkUserId: 'user_z',
        state: 'active',
        expiration: longExpiration,
      });
      await methods.upsertUserState({
        clerkUserId: 'user_z',
        state: 'active',
        expiration: shortExpiration,
      });

      const claim = await methods.findUserState('user_z');
      expect(claim?.expiration.getTime()).toBe(longExpiration.getTime());
    });
  });
});
