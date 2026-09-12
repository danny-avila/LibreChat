const express = require('express');
const request = require('supertest');

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
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('reads YAML-projected limits lazily after startup configuration', () => {
    process.env.AGENT_EVENT_USER_MAX = '80';
    process.env.AGENT_EVENT_USER_WINDOW = '2';
    const { agentEventUserLimiter } = require('./messageLimiters');
    const { limiterCache } = require('@librechat/api');
    const next = jest.fn();

    agentEventUserLimiter({ apiKeyId: 'key-1' }, {}, next);

    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ max: 80, windowMs: 120_000 }),
    );
    expect(limiterCache).toHaveBeenCalledWith('agent_event_user_limiter');
    expect(mockLimiter).toHaveBeenCalledWith({ apiKeyId: 'key-1' }, {}, next);
  });

  it('returns an actionable JSON 429 without recording a message violation', async () => {
    process.env.AGENT_EVENT_USER_MAX = '80';
    process.env.AGENT_EVENT_USER_WINDOW = '2';
    const { agentEventUserLimiter } = require('./messageLimiters');
    const { logViolation } = require('~/cache');
    const denyRequest = require('~/server/middleware/denyRequest');

    agentEventUserLimiter({ apiKeyId: 'key-1' }, {}, jest.fn());
    const options = mockRateLimit.mock.calls.at(-1)[0];
    const app = express();
    app.use((req, _res, next) => {
      req.rateLimit = { resetTime: new Date(Date.now() + 30_000) };
      next();
    });
    app.post('/api/agents/v1/events', options.handler);
    const response = await request(app).post('/api/agents/v1/events');

    expect(response.status).toBe(429);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['retry-after']).toBe('30');
    expect(response.body).toEqual({
      error: {
        code: 'agent_event_rate_limited',
        message: 'Agent event admission rate limit exceeded.',
        type: 'rate_limit_error',
      },
    });
    expect(response.text).not.toContain('event:');
    expect(logViolation).not.toHaveBeenCalled();
    expect(denyRequest).not.toHaveBeenCalled();
  });
});
