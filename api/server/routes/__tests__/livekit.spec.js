const express = require('express');
const request = require('supertest');

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
  configMiddleware: (req, _res, next) => {
    req.config = { speech: { livekit: undefined } };
    next();
  },
  checkBan: (_req, _res, next) => next(),
  uaParser: (_req, _res, next) => next(),
}));

jest.mock('~/models', () => ({
  getRoleByName: jest.fn().mockResolvedValue({
    name: 'USER',
    permissions: { VOICE: { USE: true } },
  }),
}));

describe('livekit route', () => {
  /** Guards the wiring: a bad import path or missing export here is a boot-time crash. */
  it('registers POST /token', () => {
    const router = require('../livekit');
    const posts = router.stack
      .filter((layer) => layer.route?.methods?.post)
      .map((layer) => layer.route.path);

    expect(posts).toContain('/token');
  });

  it('404s when LiveKit is unconfigured rather than throwing', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/livekit', require('../livekit'));

    const response = await request(app).post('/api/livekit/token').send({});

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/not configured/i);
  });
});
