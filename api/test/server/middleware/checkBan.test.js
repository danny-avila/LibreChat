const mockBanCacheGet = jest.fn().mockResolvedValue(undefined);
const mockBanCacheSet = jest.fn().mockResolvedValue(undefined);

jest.mock('keyv', () => ({
  Keyv: jest.fn().mockImplementation(() => ({
    get: mockBanCacheGet,
    set: mockBanCacheSet,
  })),
}));

const mockBanLogsGet = jest.fn().mockResolvedValue(undefined);
const mockBanLogsDelete = jest.fn().mockResolvedValue(true);
const mockBanLogs = {
  get: mockBanLogsGet,
  delete: mockBanLogsDelete,
  opts: { ttl: 7200000 },
};

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => mockBanLogs),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: (value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase().trim() === 'true';
    }
    return false;
  },
  keyvMongo: {},
  removePorts: jest.fn((req) => req.ip),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));

jest.mock('~/server/middleware/denyRequest', () => jest.fn().mockResolvedValue(undefined));

jest.mock('ua-parser-js', () => jest.fn(() => ({ browser: { name: 'Chrome' } })));

const checkBan = require('~/server/middleware/checkBan');
const { logger } = require('@librechat/data-schemas');
const { findUser } = require('~/models');

const createReq = (overrides = {}) => ({
  ip: '192.168.1.1',
  user: { id: 'user123' },
  headers: { 'user-agent': 'Mozilla/5.0' },
  body: {},
  baseUrl: '/api',
  originalUrl: '/api/test',
  ...overrides,
});

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('checkBan middleware', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.BAN_VIOLATIONS = 'true';
    delete process.env.USE_REDIS;
    mockBanLogs.opts.ttl = 7200000;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('early exits', () => {
    it('calls next() when BAN_VIOLATIONS is disabled', async () => {
      process.env.BAN_VIOLATIONS = 'false';
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(mockBanCacheGet).not.toHaveBeenCalled();
    });

    it('calls next() when BAN_VIOLATIONS is unset', async () => {
      delete process.env.BAN_VIOLATIONS;
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('calls next() when neither userId nor IP is available', async () => {
      const next = jest.fn();
      const req = createReq({ ip: null, user: null });

      await checkBan(req, createRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('calls next() when ban duration is <= 0', async () => {
      mockBanLogs.opts.ttl = 0;
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('calls next() when no ban exists in cache or DB', async () => {
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(mockBanCacheGet).toHaveBeenCalled();
      expect(mockBanLogsGet).toHaveBeenCalled();
    });
  });

  describe('cache hit path', () => {
    it('returns 403 when IP ban is cached', async () => {
      mockBanCacheGet.mockResolvedValueOnce({ expiresAt: Date.now() + 60000 });
      const next = jest.fn();
      const req = createReq();
      const res = createRes();

      await checkBan(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.banned).toBe(true);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when user ban is cached (IP miss)', async () => {
      mockBanCacheGet
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ expiresAt: Date.now() + 60000 });
      const next = jest.fn();
      const req = createReq();
      const res = createRes();

      await checkBan(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.banned).toBe(true);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('does not query banLogs when cache hit occurs', async () => {
      mockBanCacheGet.mockResolvedValueOnce({ expiresAt: Date.now() + 60000 });

      await checkBan(createReq(), createRes(), jest.fn());

      expect(mockBanLogsGet).not.toHaveBeenCalled();
    });
  });

  describe('active ban (positive timeLeft)', () => {
    it('caches ban with correct TTL and returns 403', async () => {
      const expiresAt = Date.now() + 3600000;
      const banRecord = { expiresAt, type: 'ban', violation_count: 3 };
      mockBanLogsGet.mockResolvedValueOnce(banRecord);
      const next = jest.fn();
      const req = createReq();
      const res = createRes();

      await checkBan(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.banned).toBe(true);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockBanCacheSet).toHaveBeenCalledTimes(2);

      const [ipCacheCall, userCacheCall] = mockBanCacheSet.mock.calls;
      expect(ipCacheCall[0]).toBe('192.168.1.1');
      expect(ipCacheCall[1]).toBe(banRecord);
      expect(ipCacheCall[2]).toBeGreaterThan(0);
      expect(ipCacheCall[2]).toBeLessThanOrEqual(3600000);

      expect(userCacheCall[0]).toBe('user123');
      expect(userCacheCall[1]).toBe(banRecord);
    });

    it('caches only IP when no userId is present', async () => {
      const expiresAt = Date.now() + 3600000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });
      const req = createReq({ user: null });

      await checkBan(req, createRes(), jest.fn());

      expect(mockBanCacheSet).toHaveBeenCalledTimes(1);
      expect(mockBanCacheSet).toHaveBeenCalledWith(
        '192.168.1.1',
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('expired ban cleanup', () => {
    it('cleans up and calls next() for expired user-key ban', async () => {
      const expiresAt = Date.now() - 1000;
      mockBanLogsGet
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ expiresAt, type: 'ban' });
      const next = jest.fn();
      const req = createReq();

      await checkBan(req, createRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(req.banned).toBeUndefined();
      expect(mockBanLogsDelete).toHaveBeenCalledWith('user123');
      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });

    it('cleans up and calls next() for expired IP-only ban (Finding 1 regression)', async () => {
      const expiresAt = Date.now() - 1000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });
      const next = jest.fn();
      const req = createReq({ user: null });

      await checkBan(req, createRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(req.banned).toBeUndefined();
      expect(mockBanLogsDelete).toHaveBeenCalledWith('192.168.1.1');
      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });

    it('cleans up both IP and user bans when both are expired', async () => {
      const expiresAt = Date.now() - 1000;
      mockBanLogsGet
        .mockResolvedValueOnce({ expiresAt, type: 'ban' })
        .mockResolvedValueOnce({ expiresAt, type: 'ban' });
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(mockBanLogsDelete).toHaveBeenCalledTimes(2);
      expect(mockBanLogsDelete).toHaveBeenCalledWith('192.168.1.1');
      expect(mockBanLogsDelete).toHaveBeenCalledWith('user123');
    });

    it('does not write to banCache when ban is expired', async () => {
      const expiresAt = Date.now() - 60000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });

      await checkBan(createReq({ user: null }), createRes(), jest.fn());

      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('Redis key paths (Finding 2 regression)', () => {
    beforeEach(() => {
      process.env.USE_REDIS = 'true';
    });

    it('uses cache-prefixed keys for banCache.get', async () => {
      await checkBan(createReq(), createRes(), jest.fn());

      expect(mockBanCacheGet).toHaveBeenCalledWith('ban_cache:ip:192.168.1.1');
      expect(mockBanCacheGet).toHaveBeenCalledWith('ban_cache:user:user123');
    });

    it('uses raw keys (not cache-prefixed) for banLogs.delete on cleanup', async () => {
      const expiresAt = Date.now() - 1000;
      mockBanLogsGet
        .mockResolvedValueOnce({ expiresAt, type: 'ban' })
        .mockResolvedValueOnce({ expiresAt, type: 'ban' });

      await checkBan(createReq(), createRes(), jest.fn());

      expect(mockBanLogsDelete).toHaveBeenCalledWith('192.168.1.1');
      expect(mockBanLogsDelete).toHaveBeenCalledWith('user123');
      for (const call of mockBanLogsDelete.mock.calls) {
        expect(call[0]).not.toMatch(/^ban_cache:/);
      }
    });

    it('uses cache-prefixed keys for banCache.set on active ban', async () => {
      const expiresAt = Date.now() + 3600000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });

      await checkBan(createReq(), createRes(), jest.fn());

      expect(mockBanCacheSet).toHaveBeenCalledWith(
        'ban_cache:ip:192.168.1.1',
        expect.any(Object),
        expect.any(Number),
      );
      expect(mockBanCacheSet).toHaveBeenCalledWith(
        'ban_cache:user:user123',
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('missing expiresAt guard (Finding 5)', () => {
    it('returns 403 without caching when expiresAt is missing', async () => {
      mockBanLogsGet.mockResolvedValueOnce({ type: 'ban' });
      const next = jest.fn();
      const req = createReq();
      const res = createRes();

      await checkBan(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.banned).toBe(true);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });

    it('returns 403 without caching when expiresAt is NaN-producing', async () => {
      mockBanLogsGet.mockResolvedValueOnce({ type: 'ban', expiresAt: 'not-a-number' });
      const next = jest.fn();
      const res = createRes();

      await checkBan(createReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });

    it('returns 403 without caching when expiresAt is null', async () => {
      mockBanLogsGet.mockResolvedValueOnce({ type: 'ban', expiresAt: null });
      const next = jest.fn();
      const res = createRes();

      await checkBan(createReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockBanCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('cache write error handling (Finding 4)', () => {
    it('still returns 403 when banCache.set rejects', async () => {
      const expiresAt = Date.now() + 3600000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });
      mockBanCacheSet.mockRejectedValue(new Error('MongoDB write failure'));
      const next = jest.fn();
      const req = createReq();
      const res = createRes();

      await checkBan(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.banned).toBe(true);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('logs a warning when banCache.set fails', async () => {
      const expiresAt = Date.now() + 3600000;
      mockBanLogsGet.mockResolvedValueOnce({ expiresAt, type: 'ban' });
      mockBanCacheSet.mockRejectedValue(new Error('write failed'));

      await checkBan(createReq(), createRes(), jest.fn());

      expect(logger.warn).toHaveBeenCalledWith(
        '[checkBan] Failed to write ban cache:',
        expect.any(Error),
      );
    });
  });

  describe('user lookup by email', () => {
    it('resolves userId from email when not on request', async () => {
      const req = createReq({ user: null, body: { email: 'test@example.com' } });
      findUser.mockResolvedValueOnce({ _id: 'resolved-user-id' });
      const expiresAt = Date.now() + 3600000;
      mockBanLogsGet
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ expiresAt, type: 'ban' });

      await checkBan(req, createRes(), jest.fn());

      expect(findUser).toHaveBeenCalledWith({ email: 'test@example.com' }, '_id');
      expect(req.banned).toBe(true);
    });

    it('continues with IP-only check when email lookup finds no user', async () => {
      const req = createReq({ user: null, body: { email: 'unknown@example.com' } });
      findUser.mockResolvedValueOnce(null);
      const next = jest.fn();

      await checkBan(req, createRes(), next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('error handling', () => {
    it('calls next(error) when an unexpected error occurs', async () => {
      mockBanCacheGet.mockRejectedValueOnce(new Error('connection lost'));
      const next = jest.fn();

      await checkBan(createReq(), createRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
