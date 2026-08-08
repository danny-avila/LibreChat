const mockRateLimit = jest.fn((options) => options);
const mockLimiterCache = jest.fn((name) => ({ name }));

jest.mock('express-rate-limit', () => mockRateLimit);
jest.mock('@librechat/api', () => ({
  limiterCache: mockLimiterCache,
  removePorts: (req) => req.ip,
}));
jest.mock('~/cache', () => ({ logViolation: jest.fn() }));

const limiter = require('./emailChangeSubmissionLimiter');

describe('emailChangeSubmissionLimiter', () => {
  it('isolates confirmation attempts by IP and user ID', () => {
    const firstUser = limiter.keyGenerator({
      ip: '203.0.113.10',
      body: { userId: '507f1f77bcf86cd799439011' },
    });
    const secondUser = limiter.keyGenerator({
      ip: '203.0.113.10',
      body: { userId: '507f1f77bcf86cd799439012' },
    });

    expect(firstUser).toBe('ip:203.0.113.10:user:507f1f77bcf86cd799439011');
    expect(secondUser).toBe('ip:203.0.113.10:user:507f1f77bcf86cd799439012');
    expect(firstUser).not.toBe(secondUser);
  });

  it('groups malformed user IDs into an IP-scoped invalid bucket', () => {
    expect(limiter.keyGenerator({ ip: '203.0.113.10', body: { userId: 'invalid' } })).toBe(
      'ip:203.0.113.10:user:invalid',
    );
    expect(limiter.keyGenerator({ ip: '203.0.113.10', body: {} })).toBe(
      'ip:203.0.113.10:user:invalid',
    );
  });

  it('uses a store isolated from ordinary email verification', () => {
    expect(limiter.store).toEqual({ name: 'email_change_submission_limiter' });
  });
});
