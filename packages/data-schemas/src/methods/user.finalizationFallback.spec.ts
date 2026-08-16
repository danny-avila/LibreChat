import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AUTH_USER_DOC_BY_ID_PREFIX, CacheKeys } from 'librechat-data-provider';

import type { IUser } from '~/types';

import { createUserMethods } from './user';
import userSchema from '~/schema/user';

let mongoServer: MongoMemoryServer;
let User: mongoose.Model<IUser>;
let methods: ReturnType<typeof createUserMethods>;
const originalAuthUserCacheMode = process.env.AUTH_USER_CACHE_MODE;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
  methods = createUserMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  if (originalAuthUserCacheMode === undefined) {
    delete process.env.AUTH_USER_CACHE_MODE;
  } else {
    process.env.AUTH_USER_CACHE_MODE = originalAuthUserCacheMode;
  }
  await mongoose.connection.dropDatabase();
});

afterEach(() => {
  if (originalAuthUserCacheMode === undefined) {
    delete process.env.AUTH_USER_CACHE_MODE;
  } else {
    process.env.AUTH_USER_CACHE_MODE = originalAuthUserCacheMode;
  }
});

describe('user finalization fallback leases', () => {
  test('renews one lease and counts only leases live at the requested time', async () => {
    const user = await User.create({
      name: 'Fallback Lease User',
      email: 'fallback-lease@example.com',
      provider: 'local',
    });
    const userId = user._id.toString();
    const firstExpiry = new Date('2026-08-16T12:05:00.000Z');
    const renewedExpiry = new Date('2026-08-16T12:10:00.000Z');

    await methods.renewUserFinalizationFallbackLease(userId, 'lease_01-safe', firstExpiry);
    await methods.renewUserFinalizationFallbackLease(userId, 'lease_01-safe', renewedExpiry);

    await expect(
      methods.countUserFinalizationFallbackLeases(userId, new Date('2026-08-16T12:05:00.000Z')),
    ).resolves.toBe(1);
    await expect(
      methods.countUserFinalizationFallbackLeases(userId, new Date('2026-08-16T12:10:00.000Z')),
    ).resolves.toBe(0);
  });

  test('clears only the requested lease', async () => {
    const user = await User.create({
      name: 'Fallback Lease Clear User',
      email: 'fallback-lease-clear@example.com',
      provider: 'local',
    });
    const userId = user._id.toString();
    const expiresAt = new Date('2026-08-16T12:05:00.000Z');
    const asOf = new Date('2026-08-16T12:00:00.000Z');
    await methods.renewUserFinalizationFallbackLease(userId, 'lease_a', expiresAt);
    await methods.renewUserFinalizationFallbackLease(userId, 'lease_b', expiresAt);

    await methods.clearUserFinalizationFallbackLease(userId, 'lease_a');

    await expect(methods.countUserFinalizationFallbackLeases(userId, asOf)).resolves.toBe(1);
    await methods.clearUserFinalizationFallbackLease(userId, 'lease_b');
    await expect(methods.countUserFinalizationFallbackLeases(userId, asOf)).resolves.toBe(0);
  });

  test('prunes expired leases with an expiry fence and invalidates the auth cache', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const user = await User.create({
      name: 'Fallback Lease Prune User',
      email: 'fallback-lease-prune@example.com',
      provider: 'openid',
    });
    const userId = user._id.toString();
    const expiredAt = new Date('2026-08-16T11:59:00.000Z');
    const liveUntil = new Date('2026-08-16T12:10:00.000Z');
    const asOf = new Date('2026-08-16T12:00:00.000Z');
    await methods.renewUserFinalizationFallbackLease(userId, 'lease_expired', expiredAt);
    await methods.renewUserFinalizationFallbackLease(userId, 'lease_live', liveUntil);

    const indexKey = `${AUTH_USER_DOC_BY_ID_PREFIX}:${userId}`;
    const cache = {
      get: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
    };
    const getCache = jest.fn().mockReturnValue(cache);
    const methodsWithCache = createUserMethods(mongoose, { getCache });
    const updateOne = jest.spyOn(User, 'updateOne');

    await expect(methodsWithCache.countUserFinalizationFallbackLeases(userId, asOf)).resolves.toBe(
      1,
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: userId, 'finalizationFallbackLeases.lease_expired': expiredAt },
      { $unset: { 'finalizationFallbackLeases.lease_expired': '' } },
      { timestamps: false },
    );
    updateOne.mockRestore();
    const stored = await User.findById(userId).select('finalizationFallbackLeases');
    const storedLeases = stored?.finalizationFallbackLeases;
    expect(storedLeases).toBeInstanceOf(Map);
    if (!(storedLeases instanceof Map)) {
      throw new Error('Expected finalization fallback leases to hydrate as a Map');
    }
    expect(storedLeases.has('lease_expired')).toBe(false);
    expect(storedLeases.get('lease_live')).toEqual(liveUntil);
    expect(getCache).toHaveBeenCalledTimes(1);
    expect(getCache).toHaveBeenCalledWith(CacheKeys.AUTH_USER_DOC);
    expect(cache.get).toHaveBeenCalledWith(indexKey);
    expect(cache.delete).toHaveBeenCalledWith(indexKey);
  });

  test('fails closed when an expired-lease cleanup loses its compare-and-set', async () => {
    const user = await User.create({
      name: 'Fallback Lease Cleanup Race User',
      email: 'fallback-lease-cleanup-race@example.com',
      provider: 'local',
    });
    const userId = user._id.toString();
    await methods.renewUserFinalizationFallbackLease(
      userId,
      'lease_raced',
      new Date('2026-08-16T11:59:00.000Z'),
    );
    const updateOne = jest.spyOn(User, 'updateOne').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });

    await expect(
      methods.countUserFinalizationFallbackLeases(userId, new Date('2026-08-16T12:00:00.000Z')),
    ).resolves.toBe(1);

    updateOne.mockRestore();
  });

  test('fails closed when the lease document cannot be read', async () => {
    jest.spyOn(User, 'findById').mockImplementationOnce(() => {
      throw new Error('mongo read failed');
    });

    await expect(
      methods.countUserFinalizationFallbackLeases(new mongoose.Types.ObjectId().toString()),
    ).resolves.toBe(1);
  });

  test('rejects keys that are unsafe in a Mongo map path', async () => {
    const user = await User.create({
      name: 'Fallback Lease Key User',
      email: 'fallback-lease-key@example.com',
      provider: 'local',
    });
    const userId = user._id.toString();
    const expiresAt = new Date(Date.now() + 60_000);

    await expect(
      methods.renewUserFinalizationFallbackLease(userId, 'unsafe.key', expiresAt),
    ).rejects.toThrow(/safe opaque key/);
    await expect(methods.clearUserFinalizationFallbackLease(userId, '$unsafe')).rejects.toThrow(
      /safe opaque key/,
    );
    await expect(
      methods.renewUserFinalizationFallbackLease(userId, '__proto__', expiresAt),
    ).rejects.toThrow(/safe opaque key/);
    await expect(methods.countUserFinalizationFallbackLeases(userId)).resolves.toBe(0);
  });

  test('fails renewal when the user no longer exists', async () => {
    await expect(
      methods.renewUserFinalizationFallbackLease(
        new mongoose.Types.ObjectId().toString(),
        'lease_missing_user',
        new Date(Date.now() + 60_000),
      ),
    ).rejects.toThrow(/missing user/);
  });

  test('invalidates cached auth user documents after renew and clear mutations', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const user = await User.create({
      name: 'Fallback Lease Cache User',
      email: 'fallback-lease-cache@example.com',
      provider: 'openid',
    });
    const userId = user._id.toString();
    const indexKey = `${AUTH_USER_DOC_BY_ID_PREFIX}:${userId}`;
    const cache = {
      get: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
    };
    const getCache = jest.fn().mockReturnValue(cache);
    const methodsWithCache = createUserMethods(mongoose, {
      getCache,
    });

    await methodsWithCache.renewUserFinalizationFallbackLease(
      userId,
      'lease_cache',
      new Date(Date.now() + 60_000),
    );
    await methodsWithCache.clearUserFinalizationFallbackLease(userId, 'lease_cache');

    expect(getCache).toHaveBeenCalledTimes(2);
    expect(getCache).toHaveBeenNthCalledWith(1, CacheKeys.AUTH_USER_DOC);
    expect(getCache).toHaveBeenNthCalledWith(2, CacheKeys.AUTH_USER_DOC);
    expect(cache.get).toHaveBeenCalledTimes(2);
    expect(cache.get).toHaveBeenNthCalledWith(1, indexKey);
    expect(cache.get).toHaveBeenNthCalledWith(2, indexKey);
    expect(cache.delete).toHaveBeenCalledTimes(2);
    expect(cache.delete).toHaveBeenNthCalledWith(1, indexKey);
    expect(cache.delete).toHaveBeenNthCalledWith(2, indexKey);
  });
});
