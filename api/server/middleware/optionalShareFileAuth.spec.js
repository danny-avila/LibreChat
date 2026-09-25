const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  runAsSystem: (work) => work(),
}));
jest.mock('~/models', () => ({
  findSession: jest.fn(),
  getUserById: jest.fn(),
}));

const db = require('~/models');
const optionalShareFileAuth = require('./optionalShareFileAuth');
const viewerId = '507f1f77bcf86cd799439011';
const secret = 'share-cookie-wiring-test-secret';

function createApp(user) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use(optionalShareFileAuth);
  app.get('/file', (req, res) => res.json({ user: req.user ?? null }));
  return app;
}

describe('optional share-file cookie auth wiring', () => {
  const originalSecret = process.env.JWT_REFRESH_SECRET;
  const originalReuse = process.env.OPENID_REUSE_TOKENS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = secret;
    process.env.OPENID_REUSE_TOKENS = 'true';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = originalSecret;
    if (originalReuse === undefined) delete process.env.OPENID_REUSE_TOKENS;
    else process.env.OPENID_REUSE_TOKENS = originalReuse;
  });

  it('reuses a loaded bearer viewer', async () => {
    const response = await request(createApp({ id: viewerId }))
      .get('/file')
      .set('Cookie', 'refreshToken=invalid')
      .expect(200);
    expect(response.body.user.id).toBe(viewerId);
    expect(db.findSession).not.toHaveBeenCalled();
    expect(db.getUserById).not.toHaveBeenCalled();
  });

  it('loads a viewer through the shared authenticator from a live refresh cookie', async () => {
    const token = jwt.sign({ id: viewerId }, secret, { expiresIn: '1m' });
    db.findSession.mockResolvedValue({ user: viewerId });
    db.getUserById.mockResolvedValue({ _id: viewerId, role: 'USER' });
    const response = await request(createApp())
      .get('/file')
      .set('Cookie', `refreshToken=${token}`)
      .expect(200);
    expect(response.body.user.id).toBe(viewerId);
    expect(db.findSession).toHaveBeenCalledWith({ userId: viewerId, refreshToken: token });
  });

  it('leaves OpenID viewers anonymous without the signed identity cookie', async () => {
    const response = await request(createApp())
      .get('/file')
      .set('Cookie', 'token_provider=openid; refreshToken=provider-token')
      .expect(200);
    expect(response.body.user).toBeNull();
    expect(db.findSession).not.toHaveBeenCalled();
    expect(db.getUserById).not.toHaveBeenCalled();
  });
});
