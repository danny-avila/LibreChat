const mockLimiter = jest.fn((_req, _res, next) => next());
const mockRateLimit = jest.fn(() => mockLimiter);

jest.mock('express-rate-limit', () => mockRateLimit);
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn(() => ({})),
  removePorts: jest.fn(),
}));
jest.mock('~/server/middleware/denyRequest', () => jest.fn());
jest.mock('~/cache', () => ({ logViolation: jest.fn() }));

describe('agent event rate limiter', () => {
  it('reads YAML-projected limits lazily after startup configuration', () => {
    process.env.AGENT_EVENT_USER_MAX = '80';
    process.env.AGENT_EVENT_USER_WINDOW = '2';
    const { agentEventUserLimiter } = require('./messageLimiters');
    const next = jest.fn();

    agentEventUserLimiter({ apiKeyId: 'key-1' }, {}, next);

    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ max: 80, windowMs: 120_000 }),
    );
    expect(mockLimiter).toHaveBeenCalledWith({ apiKeyId: 'key-1' }, {}, next);
  });
});
