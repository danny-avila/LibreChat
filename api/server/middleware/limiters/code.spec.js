const express = require('express');
const request = require('supertest');

const mockLimiter = jest.fn((_req, _res, next) => next());
const mockRateLimit = jest.fn(() => mockLimiter);
const mockIpKeyGenerator = jest.fn((ip) => ip);

jest.mock('express-rate-limit', () => ({
  rateLimit: mockRateLimit,
  ipKeyGenerator: mockIpKeyGenerator,
}));
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn(() => ({})),
}));

describe('code environment rate limiters', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('uses a configurable per-user bucket', () => {
    process.env.CODE_ENVIRONMENT_PAIRING_USER_MAX = '3';
    process.env.CODE_ENVIRONMENT_PAIRING_USER_WINDOW = '15';
    const { codeEnvironmentPairingLimiter } = require('./code');
    const { limiterCache } = require('@librechat/api');
    const req = { user: { id: 'user-1' } };
    const next = jest.fn();

    codeEnvironmentPairingLimiter(req, {}, next);

    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        max: 3,
        windowMs: 900_000,
        keyGenerator: expect.any(Function),
      }),
    );
    expect(mockRateLimit.mock.calls.at(-1)[0].keyGenerator(req)).toBe('user-1');
    expect(limiterCache).toHaveBeenCalledWith('code_environment_pairing_user_limiter');
    expect(mockLimiter).toHaveBeenCalledWith(req, {}, next);
  });

  it('falls back to safe limits for invalid environment values', () => {
    process.env.CODE_ENVIRONMENT_PAIRING_USER_MAX = 'NaN';
    process.env.CODE_ENVIRONMENT_PAIRING_USER_WINDOW = '-1';
    const { codeEnvironmentPairingLimiter } = require('./code');

    codeEnvironmentPairingLimiter({ user: { id: 'user-1' } }, {}, jest.fn());

    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ max: 5, windowMs: 3_600_000 }),
    );
  });

  it('uses a configurable user and normalized IP bucket for status polling', () => {
    process.env.CODE_ENVIRONMENT_STATUS_USER_MAX = '24';
    process.env.CODE_ENVIRONMENT_STATUS_USER_WINDOW = '2';
    const { codeEnvironmentStatusLimiter } = require('./code');
    const { limiterCache } = require('@librechat/api');
    const req = { user: { id: 'user-1' }, ip: '2001:db8::1' };

    codeEnvironmentStatusLimiter(req, {}, jest.fn());

    const options = mockRateLimit.mock.calls.at(-1)[0];
    expect(options).toEqual(
      expect.objectContaining({ max: 24, windowMs: 120_000, keyGenerator: expect.any(Function) }),
    );
    expect(options.keyGenerator(req)).toBe('user-1:2001:db8::1');
    expect(mockIpKeyGenerator).toHaveBeenCalledWith('2001:db8::1');
    expect(limiterCache).toHaveBeenCalledWith('code_environment_status_user_limiter');
  });

  it('returns an actionable JSON response when the limit is exceeded', async () => {
    const { codeEnvironmentPairingLimiter } = require('./code');

    codeEnvironmentPairingLimiter({ user: { id: 'user-1' } }, {}, jest.fn());
    const options = mockRateLimit.mock.calls.at(-1)[0];
    const app = express();
    app.use((req, _res, next) => {
      req.rateLimit = { resetTime: new Date(Date.now() + 30_000) };
      next();
    });
    app.post('/api/code-environments/pairings', options.handler);
    const response = await request(app).post('/api/code-environments/pairings');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('30');
    expect(response.body).toEqual({
      error: {
        code: 'code_environment_pairing_rate_limited',
        message: 'Code environment pairing rate limit exceeded.',
        type: 'rate_limit_error',
      },
    });
  });
});
