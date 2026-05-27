jest.mock('express-rate-limit', () => jest.fn(() => jest.fn()));
jest.mock('~/cache', () => ({ logViolation: jest.fn() }));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn((value) => value === 'true'),
  limiterCache: jest.fn(() => undefined),
  removePorts: jest.fn((req) => req.ip),
}));

describe('loginLimiter keyGenerator', () => {
  const loadKeyGenerator = () => {
    jest.resetModules();
    return require('./loginLimiter').keyGenerator;
  };

  const makeReq = (overrides = {}) => ({
    ip: '203.0.113.10',
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    ...overrides,
  });

  afterEach(() => {
    delete process.env.LOGIN_LIMITER_INCLUDE_USER_AGENT;
  });

  it('returns the bare IP when LOGIN_LIMITER_INCLUDE_USER_AGENT is unset', () => {
    const keyGenerator = loadKeyGenerator();
    expect(keyGenerator(makeReq())).toBe('203.0.113.10');
  });

  it('returns the bare IP when LOGIN_LIMITER_INCLUDE_USER_AGENT is "false"', () => {
    process.env.LOGIN_LIMITER_INCLUDE_USER_AGENT = 'false';
    const keyGenerator = loadKeyGenerator();
    expect(keyGenerator(makeReq())).toBe('203.0.113.10');
  });

  describe('with LOGIN_LIMITER_INCLUDE_USER_AGENT=true', () => {
    beforeEach(() => {
      process.env.LOGIN_LIMITER_INCLUDE_USER_AGENT = 'true';
    });

    it('appends a stable 16-char hex hash of the User-Agent to the IP', () => {
      const keyGenerator = loadKeyGenerator();
      const key = keyGenerator(makeReq());
      expect(key).toMatch(/^203\.0\.113\.10:[0-9a-f]{16}$/);
    });

    it('produces different keys for the same IP with different User-Agents', () => {
      const keyGenerator = loadKeyGenerator();
      const chrome = keyGenerator(makeReq({ headers: { 'user-agent': 'Chrome/120' } }));
      const firefox = keyGenerator(makeReq({ headers: { 'user-agent': 'Firefox/121' } }));
      expect(chrome).not.toBe(firefox);
    });

    it('produces the same key for identical IP+UA across calls', () => {
      const keyGenerator = loadKeyGenerator();
      const req = makeReq();
      expect(keyGenerator(req)).toBe(keyGenerator(req));
    });

    it('handles a missing User-Agent header without throwing', () => {
      const keyGenerator = loadKeyGenerator();
      const key = keyGenerator(makeReq({ headers: {} }));
      expect(key).toMatch(/^203\.0\.113\.10:[0-9a-f]{16}$/);
    });

    it('handles a missing headers object without throwing', () => {
      const keyGenerator = loadKeyGenerator();
      const key = keyGenerator({ ip: '198.51.100.4' });
      expect(key).toMatch(/^198\.51\.100\.4:[0-9a-f]{16}$/);
    });
  });
});
