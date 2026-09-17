import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createKeyModel } from '~/models/key';
import { createKeyMethods } from './key';

jest.mock('~/crypto', () => ({
  encrypt: jest.fn(async (value: string) => `encrypted:${value}`),
  decrypt: jest.fn(async (value: string) => value.replace(/^encrypted:/, '')),
}));

describe('user key encrypted snapshot compare-and-set on MongoDB', () => {
  let mongo: MongoMemoryServer;
  let methods: ReturnType<typeof createKeyMethods>;
  let userId: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createKeyModel(mongoose);
    methods = createKeyMethods(mongoose);
  }, 60000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await runAsSystem(async () => {
      await mongoose.models.Key.deleteMany({});
    });
    userId = new mongoose.Types.ObjectId().toString();
  });
  function identity() {
    return { userId, name: 'google' };
  }

  it('returns encrypted snapshot data and atomically replaces value and expiry', async () => {
    await methods.updateUserKey({ ...identity(), value: 'before' });
    const expected = await methods.getUserKeySnapshot(identity());
    expect(expected).toEqual({
      id: expect.any(String),
      value: 'encrypted:before',
      expiresAt: null,
    });
    expect(
      await methods.compareAndSetUserKey({
        ...identity(),
        expected,
        value: 'after',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    ).toBe(true);
    expect(await methods.getUserKey(identity())).toBe('after');
    expect(await methods.getUserKeySnapshot(identity())).toMatchObject({
      value: 'encrypted:after',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
  });

  it('removes an old expiry when replacing with an unlimited key', async () => {
    await methods.updateUserKey({ ...identity(), value: 'before', expiresAt: '2099-01-01' });
    const expected = await methods.getUserKeySnapshot(identity());
    expect(await methods.compareAndSetUserKey({ ...identity(), expected, value: 'after' })).toBe(
      true,
    );
    expect(await methods.getUserKeyExpiry(identity())).toEqual({ expiresAt: 'never' });
  });

  it.each(['value', 'expiry', 'delete', 'recreate'])(
    'rejects a stale snapshot after concurrent %s change',
    async (change) => {
      await methods.updateUserKey({ ...identity(), value: 'before' });
      const expected = await methods.getUserKeySnapshot(identity());
      if (change === 'value') await methods.updateUserKey({ ...identity(), value: 'newer-value' });
      if (change === 'expiry')
        await methods.updateUserKey({ ...identity(), value: 'before', expiresAt: '2099-01-01' });
      if (change === 'delete' || change === 'recreate') await methods.deleteUserKey(identity());
      if (change === 'recreate') await methods.updateUserKey({ ...identity(), value: 'before' });
      const changed = await methods.getUserKeySnapshot(identity());
      expect(
        await methods.compareAndSetUserKey({ ...identity(), expected, value: 'stale-merged' }),
      ).toBe(false);
      expect(await methods.getUserKeySnapshot(identity())).toEqual(changed);
    },
  );

  it('allows exactly one competing merge from the same snapshot', async () => {
    await methods.updateUserKey({ ...identity(), value: 'before' });
    const expected = await methods.getUserKeySnapshot(identity());
    const results = await Promise.all(
      ['first', 'second'].map((value) =>
        methods.compareAndSetUserKey({ ...identity(), expected, value }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await methods.getUserKey(identity())).toBe(results[0] ? 'first' : 'second');
  });

  it('does not preserve a credential that expires before the atomic write', async () => {
    await methods.updateUserKey({
      ...identity(),
      value: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    });
    const expected = await methods.getUserKeySnapshot(identity());
    expect(expected).not.toBeNull();
    expect(
      await methods.compareAndSetUserKey({
        ...identity(),
        expected,
        value: 'revived',
        requireActive: true,
      }),
    ).toBe(false);
  });

  it('inserts missing records without overwriting a record created after the read', async () => {
    expect(await methods.getUserKeySnapshot(identity())).toBeNull();
    expect(
      await methods.compareAndSetUserKey({ ...identity(), expected: null, value: 'first' }),
    ).toBe(true);
    expect(
      await methods.compareAndSetUserKey({ ...identity(), expected: null, value: 'stale' }),
    ).toBe(false);
    expect(await methods.getUserKey(identity())).toBe('first');
    expect(await mongoose.models.Key.countDocuments(identity())).toBe(1);
  });

  it('does not apply another owner snapshot even with its exact ciphertext and id', async () => {
    await methods.updateUserKey({ ...identity(), value: 'before' });
    const expected = await methods.getUserKeySnapshot(identity());
    const other = { userId: new mongoose.Types.ObjectId().toString(), name: 'google' };
    expect(await methods.getUserKeySnapshot(other)).toBeNull();
    expect(await methods.compareAndSetUserKey({ ...other, expected, value: 'stolen' })).toBe(false);
    expect(await methods.getUserKey(identity())).toBe('before');
  });

  it('scopes snapshots, compare-and-set and inserts to the current tenant', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await methods.updateUserKey({ ...identity(), value: 'tenant-a-key' });
    });
    const expected = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.getUserKeySnapshot(identity()),
    );
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
      expect(await methods.getUserKeySnapshot(identity())).toBeNull();
      expect(await methods.compareAndSetUserKey({ ...identity(), expected, value: 'stolen' })).toBe(
        false,
      );
      expect(
        await methods.compareAndSetUserKey({
          ...identity(),
          expected: null,
          value: 'tenant-b-key',
        }),
      ).toBe(true);
      expect(await methods.getUserKey(identity())).toBe('tenant-b-key');
    });
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      expect(await methods.getUserKey(identity())).toBe('tenant-a-key');
    });
  });
});
