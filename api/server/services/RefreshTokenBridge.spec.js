jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  encryptV2: jest.fn(async (value) => `encrypted:${value}`),
  decryptV2: jest.fn(async (value) => value.replace(/^encrypted:/, '')),
}));

const { encryptV2, decryptV2 } = require('@librechat/data-schemas');
const {
  storeRefreshTokenBridge,
  getRefreshTokenBridge,
  deleteRefreshTokenBridge,
  purgeExpiredBridges,
  __internals,
} = require('./RefreshTokenBridge');

describe('RefreshTokenBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    __internals.bridges.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('storeRefreshTokenBridge', () => {
    it('stores an encrypted bridge with required fields', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
      });

      const bridge = Array.from(__internals.bridges.values())[0];
      expect(encryptV2).toHaveBeenCalledWith('rt-new');
      expect(bridge.encryptedNewToken).toBe('encrypted:rt-new');
      expect(JSON.stringify(bridge)).not.toContain('"rt-new"');
    });

    it('stores optional tenant and issuer context', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
        tenantId: 'tenant-1',
        openidIssuer: 'https://issuer.example.com',
      });

      const bridge = Array.from(__internals.bridges.values())[0];
      expect(bridge.tenantId).toBe('tenant-1');
      expect(bridge.issuer).toBe('https://issuer.example.com');
    });

    it('does not store a bridge without required fields', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-123',
      });

      expect(__internals.bridges.size).toBe(0);
    });

    it('purges expired bridges before inserting a new one', async () => {
      jest.useFakeTimers();
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old-1',
        newRefreshToken: 'rt-new-1',
        userId: 'user-1',
        ttl: 100,
      });

      jest.advanceTimersByTime(110);
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old-2',
        newRefreshToken: 'rt-new-2',
        userId: 'user-2',
        ttl: 10000,
      });

      expect(__internals.bridges.size).toBe(1);
      await expect(
        getRefreshTokenBridge({ oldRefreshToken: 'rt-old-2', userId: 'user-2' }),
      ).resolves.toBe('rt-new-2');
    });
  });

  describe('getRefreshTokenBridge', () => {
    it('retrieves a matching bridge without consuming it', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
      });

      const result = await getRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-123',
      });

      expect(result).toBe('rt-new');
      expect(decryptV2).toHaveBeenCalledWith('encrypted:rt-new');
      expect(__internals.bridges.size).toBe(1);
    });

    it('returns null when bridge does not exist', async () => {
      await expect(
        getRefreshTokenBridge({
          oldRefreshToken: 'rt-nonexistent',
          userId: 'user-123',
        }),
      ).resolves.toBeNull();
    });

    it('returns null when userId does not match', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
      });

      const result = await getRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-wrong',
      });

      expect(result).toBeNull();
      expect(__internals.bridges.size).toBe(1);
    });

    it('returns null when tenantId does not match', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
        tenantId: 'tenant-1',
      });

      const result = await getRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-123',
        tenantId: 'tenant-2',
      });

      expect(result).toBeNull();
      expect(__internals.bridges.size).toBe(1);
    });

    it('returns null when issuer does not match', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
        openidIssuer: 'https://issuer1.example.com',
      });

      const result = await getRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-123',
        openidIssuer: 'https://issuer2.example.com',
      });

      expect(result).toBeNull();
      expect(__internals.bridges.size).toBe(1);
    });

    it('returns null and deletes when bridge has expired', async () => {
      jest.useFakeTimers();
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
        ttl: 100,
      });

      jest.advanceTimersByTime(110);

      const result = await getRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        userId: 'user-123',
      });

      expect(result).toBeNull();
      expect(__internals.bridges.size).toBe(0);
    });
  });

  describe('deleteRefreshTokenBridge', () => {
    it('deletes an existing bridge explicitly', async () => {
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old',
        newRefreshToken: 'rt-new',
        userId: 'user-123',
      });

      expect(deleteRefreshTokenBridge({ oldRefreshToken: 'rt-old' })).toBe(true);
      expect(__internals.bridges.size).toBe(0);
    });

    it('returns false when the bridge does not exist', () => {
      expect(deleteRefreshTokenBridge({ oldRefreshToken: 'missing' })).toBe(false);
    });
  });

  describe('purgeExpiredBridges', () => {
    it('removes expired bridges and leaves fresh ones', async () => {
      jest.useFakeTimers();
      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old-1',
        newRefreshToken: 'rt-new-1',
        userId: 'user-1',
        ttl: 100,
      });

      await storeRefreshTokenBridge({
        oldRefreshToken: 'rt-old-2',
        newRefreshToken: 'rt-new-2',
        userId: 'user-2',
        ttl: 10000,
      });

      jest.advanceTimersByTime(110);
      purgeExpiredBridges();

      expect(__internals.bridges.size).toBe(1);
      await expect(
        getRefreshTokenBridge({ oldRefreshToken: 'rt-old-2', userId: 'user-2' }),
      ).resolves.toBe('rt-new-2');
    });

    it('handles empty bridge map gracefully', () => {
      expect(() => purgeExpiredBridges()).not.toThrow();
    });
  });
});
