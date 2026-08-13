import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createRefreshTokenBridgeMethods } from './refreshTokenBridge';
import refreshTokenBridgeSchema from '~/schema/refreshTokenBridge';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createRefreshTokenBridgeMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  if (!mongoose.models.RefreshTokenBridge) {
    mongoose.model<t.IRefreshTokenBridge>('RefreshTokenBridge', refreshTokenBridgeSchema);
  }
  methods = createRefreshTokenBridgeMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('RefreshTokenBridge Methods', () => {
  it('keeps the lookup indexes aligned with the data-layer query shape', () => {
    const indexKeys = mongoose.models.RefreshTokenBridge.schema.indexes().map(([key]) => key);

    expect(indexKeys).toContainEqual({ oldRefreshTokenHash: 1, userId: 1, tenantId: 1 });
    expect(indexKeys).not.toContainEqual({
      oldRefreshTokenHash: 1,
      userId: 1,
      tenantId: 1,
      openidIssuer: 1,
    });
  });

  it('upserts and finds a bridge by old token hash, user, and tenant', async () => {
    await methods.upsertRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      encryptedNewRefreshToken: 'encrypted-new',
      userId: 'user-1',
      tenantId: 'tenant-1',
      openidIssuer: 'https://issuer.example.com',
      expiresAt: new Date(Date.now() + 60000),
    });

    const found = await methods.findRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(found?.encryptedNewRefreshToken).toBe('encrypted-new');
    expect(found?.openidIssuer).toBe('https://issuer.example.com');
  });

  it('replaces the encrypted token and expiry on repeated stores', async () => {
    await methods.upsertRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      encryptedNewRefreshToken: 'encrypted-old',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60000),
    });

    const nextExpiresAt = new Date(Date.now() + 120000);
    await methods.upsertRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      encryptedNewRefreshToken: 'encrypted-new',
      userId: 'user-1',
      expiresAt: nextExpiresAt,
    });

    const found = await methods.findRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      userId: 'user-1',
    });

    expect(found?.encryptedNewRefreshToken).toBe('encrypted-new');
    expect(found?.expiresAt.getTime()).toBe(nextExpiresAt.getTime());
    expect(await mongoose.models.RefreshTokenBridge.countDocuments()).toBe(1);
  });

  it('does not return expired bridges before Mongo TTL cleanup runs', async () => {
    await methods.upsertRefreshTokenBridge({
      oldRefreshTokenHash: 'old-hash',
      encryptedNewRefreshToken: 'encrypted-new',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      methods.findRefreshTokenBridge({
        oldRefreshTokenHash: 'old-hash',
        userId: 'user-1',
      }),
    ).resolves.toBeNull();
  });
});
