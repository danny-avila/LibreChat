const express = require('express');
const request = require('supertest');

const originalEnv = process.env;

const createBanLogsStub = ({ ttl = 60_000, bans = {} } = {}) => ({
  opts: { ttl },
  get: jest.fn((key) => Promise.resolve(bans[key])),
  delete: jest.fn(() => Promise.resolve()),
});

const createApp = ({ bans = {}, findUserImpl } = {}) => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    BAN_VIOLATIONS: 'true',
    USE_REDIS: 'false',
  };

  const banLogsStub = createBanLogsStub({ bans });
  const findUser = jest.fn(findUserImpl ?? (() => Promise.resolve(null)));

  jest.doMock('@librechat/api', () => ({
    isEnabled: (value) => value === 'true',
    keyvMongo: undefined,
    removePorts: (req) => req.headers['x-test-ip'] ?? req.ip,
  }));
  jest.doMock('~/cache', () => ({
    getLogStores: jest.fn(() => banLogsStub),
  }));
  jest.doMock('~/models', () => ({ findUser }));

  const { createCheckBan } = require('./checkBan');

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, res, next) => {
    const testUserId = req.headers['x-test-user-id'];
    if (testUserId) {
      req.user = { id: testUserId };
    }
    next();
  });

  return { app, createCheckBan, findUser, banLogsStub };
};

const mountAndRequest = (app, middleware) => {
  app.post('/probe', middleware, (req, res) => res.status(204).end());
  return request(app).post('/probe');
};

describe('checkBan — ipOnly mode', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    jest.dontMock('~/cache');
    jest.dontMock('~/models');
    process.env = originalEnv;
  });

  it('blocks a banned IP with the stable Clerk error body', async () => {
    const { app, createCheckBan } = createApp({
      bans: { 'ip-only-banned': { expiresAt: Date.now() + 60_000 } },
    });
    const checkBanIpOnly = createCheckBan({ mode: 'ipOnly' });

    const res = await mountAndRequest(app, checkBanIpOnly)
      .set('x-test-ip', 'ip-only-banned')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'CLERK_LOGIN_FORBIDDEN' });
  });

  it('never checks req.user even when a banned user ID is present', async () => {
    const { app, createCheckBan, banLogsStub } = createApp({
      bans: { 'banned-user-id': { expiresAt: Date.now() + 60_000 } },
    });
    const checkBanIpOnly = createCheckBan({ mode: 'ipOnly' });

    const res = await mountAndRequest(app, checkBanIpOnly)
      .set('x-test-ip', 'clean-ip')
      .set('x-test-user-id', 'banned-user-id')
      .send({});

    expect(res.status).toBe(204);
    expect(banLogsStub.get).not.toHaveBeenCalledWith('banned-user-id');
  });

  it('never reads req.body.email', async () => {
    const { app, createCheckBan, findUser } = createApp();
    const checkBanIpOnly = createCheckBan({ mode: 'ipOnly' });

    await mountAndRequest(app, checkBanIpOnly)
      .set('x-test-ip', 'clean-ip')
      .send({ email: 'someone@example.com' });

    expect(findUser).not.toHaveBeenCalled();
  });
});

describe('checkBan — resolvedIdentity mode', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    jest.dontMock('~/cache');
    jest.dontMock('~/models');
    process.env = originalEnv;
  });

  it('blocks a banned resolved req.user with the stable Clerk error body', async () => {
    const { app, createCheckBan } = createApp({
      bans: { 'resolved-banned-user': { expiresAt: Date.now() + 60_000 } },
    });
    const checkBanResolved = createCheckBan({ mode: 'resolvedIdentity' });

    const res = await mountAndRequest(app, checkBanResolved)
      .set('x-test-ip', 'clean-ip')
      .set('x-test-user-id', 'resolved-banned-user')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'CLERK_LOGIN_FORBIDDEN' });
  });

  it('allows a non-banned resolved req.user through', async () => {
    const { app, createCheckBan } = createApp();
    const checkBanResolved = createCheckBan({ mode: 'resolvedIdentity' });

    const res = await mountAndRequest(app, checkBanResolved)
      .set('x-test-ip', 'clean-ip')
      .set('x-test-user-id', 'clean-user')
      .send({});

    expect(res.status).toBe(204);
  });

  it('never reads req.body.email even without a resolved req.user', async () => {
    const { app, createCheckBan, findUser } = createApp();
    const checkBanResolved = createCheckBan({ mode: 'resolvedIdentity' });

    await mountAndRequest(app, checkBanResolved)
      .set('x-test-ip', 'clean-ip')
      .send({ email: 'someone@example.com' });

    expect(findUser).not.toHaveBeenCalled();
  });
});

describe('checkBan — default mode regression', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    jest.dontMock('~/cache');
    jest.dontMock('~/models');
    process.env = originalEnv;
  });

  it('still falls back to an unscoped req.body.email lookup', async () => {
    const { app, createCheckBan, findUser } = createApp({
      findUserImpl: () => Promise.resolve({ _id: 'looked-up-id' }),
    });
    const checkBanDefault = createCheckBan();

    await mountAndRequest(app, checkBanDefault)
      .set('x-test-ip', 'clean-ip')
      .send({ email: 'someone@example.com' });

    expect(findUser).toHaveBeenCalledWith({ email: 'someone@example.com' }, '_id');
  });
});
