const express = require('express');
const request = require('supertest');
const { ViolationTypes } = require('librechat-data-provider');

const originalEnv = process.env;

const createApp = () => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    LOGIN_MAX: '2',
    LOGIN_WINDOW: '5',
  };

  jest.doMock('@librechat/api', () => ({
    limiterCache: jest.fn(() => undefined),
    removePorts: (req) => req.headers['x-test-ip'] ?? req.ip,
  }));
  jest.doMock('~/cache', () => ({
    logViolation: jest.fn().mockResolvedValue(undefined),
  }));

  const { createLoginLimiter, clerkLoginLimiterHandler } = require('./loginLimiter');
  const { logViolation } = require('~/cache');

  const app = express();
  app.use(express.json());

  return { app, createLoginLimiter, clerkLoginLimiterHandler, logViolation };
};

describe('createLoginLimiter', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    jest.dontMock('~/cache');
    process.env = originalEnv;
  });

  it('returns the stable Clerk error code body once the limit is exceeded', async () => {
    const { app, createLoginLimiter, clerkLoginLimiterHandler } = createApp();
    app.post('/clerk-login', createLoginLimiter(clerkLoginLimiterHandler), (req, res) =>
      res.status(200).json({ ok: true }),
    );

    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.9').expect(200);
    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.9').expect(200);
    const res = await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.9');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ code: 'CLERK_LOGIN_RATE_LIMITED' });
  });

  it('records the same violation type as the local-login limiter', async () => {
    const { app, createLoginLimiter, clerkLoginLimiterHandler, logViolation } = createApp();
    app.post('/clerk-login', createLoginLimiter(clerkLoginLimiterHandler), (req, res) =>
      res.status(200).json({ ok: true }),
    );

    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.10').expect(200);
    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.10').expect(200);
    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.10');

    expect(logViolation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ViolationTypes.LOGINS,
      expect.objectContaining({ type: ViolationTypes.LOGINS }),
      undefined,
    );
  });

  it('scopes the limit independently per IP', async () => {
    const { app, createLoginLimiter, clerkLoginLimiterHandler } = createApp();
    app.post('/clerk-login', createLoginLimiter(clerkLoginLimiterHandler), (req, res) =>
      res.status(200).json({ ok: true }),
    );

    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.11').expect(200);
    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.11').expect(200);
    await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.11').expect(429);

    const res = await request(app).post('/clerk-login').set('x-test-ip', '203.0.113.12');
    expect(res.status).toBe(200);
  });
});
