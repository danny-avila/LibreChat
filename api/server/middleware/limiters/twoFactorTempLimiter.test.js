const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');

const originalEnv = process.env;
const jwtSecret = 'test-two-factor-secret';

const createToken = (userId, purpose = 'login_2fa_challenge') =>
  jwt.sign({ userId, purpose }, jwtSecret, { expiresIn: '5m' });

const createApp = () => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    JWT_SECRET: jwtSecret,
    LOGIN_MAX: '2',
    LOGIN_WINDOW: '5',
    TWO_FACTOR_TEMP_MAX: '2',
    TWO_FACTOR_TEMP_WINDOW: '5',
  };

  jest.doMock('@librechat/api', () => ({
    limiterCache: jest.fn(() => undefined),
    removePorts: (req) => req?.['ip'],
  }));
  jest.doMock('~/cache', () => ({
    logViolation: jest.fn().mockResolvedValue(undefined),
  }));

  const setTwoFactorTempUser = require('../setTwoFactorTempUser');
  const { setTwoFactorAcknowledgementTempUser, setTwoFactorFinalizationTempUser } =
    setTwoFactorTempUser;
  const twoFactorTempLimiter = require('./twoFactorTempLimiter');
  const { logViolation } = require('~/cache');

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/verify', setTwoFactorTempUser, twoFactorTempLimiter, (req, res) =>
    res.status(204).end(),
  );
  app.post('/finalize', setTwoFactorFinalizationTempUser, twoFactorTempLimiter, (req, res) =>
    res.status(204).end(),
  );
  app.post('/acknowledge', setTwoFactorAcknowledgementTempUser, twoFactorTempLimiter, (req, res) =>
    res.status(204).end(),
  );

  return { app, logViolation };
};

describe('twoFactorTempLimiter', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    jest.dontMock('~/cache');
    process.env = originalEnv;
  });

  it('limits a valid temp-token user across rotating source IPs', async () => {
    const { app, logViolation } = createApp();
    const tempToken = createToken('user-1');

    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.1')
      .send({ tempToken, token: '000000' })
      .expect(204);
    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.2')
      .send({ tempToken, token: '000001' })
      .expect(204);

    const response = await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.3')
      .send({ tempToken, token: '000002' })
      .expect(429);

    expect(response.body).toEqual({
      message: 'Too many verification attempts, please try again after 5 minutes.',
    });
    expect(logViolation).toHaveBeenCalledTimes(1);
    expect(logViolation.mock.calls[0][0].user).toEqual({ id: 'user-1' });
    expect(logViolation.mock.calls[0][3]).toMatchObject({
      limiter: 'user',
      max: '2',
      windowInMinutes: 5,
    });
  });

  it('keeps the existing source IP limit before the user limit', async () => {
    const { app, logViolation } = createApp();

    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ tempToken: createToken('user-a'), token: '000000' })
      .expect(204);
    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ tempToken: createToken('user-b'), token: '000001' })
      .expect(204);

    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ tempToken: createToken('user-c'), token: '000002' })
      .expect(429);

    expect(logViolation).toHaveBeenCalledTimes(1);
    expect(logViolation.mock.calls[0][3]).toMatchObject({
      limiter: 'ip',
      max: '2',
      windowInMinutes: 5,
    });
  });

  it.each([
    ['login challenge', 'tempToken', 'login_2fa_challenge'],
    ['required setup', 'tempToken', 'required_2fa_setup'],
    ['required acknowledgement', 'acknowledgementToken', 'required_2fa_acknowledgement'],
    ['required finalization', 'finalizationToken', 'required_2fa_finalization'],
  ])('applies the same per-user limit to a %s token', async (_name, field, purpose) => {
    const { app, logViolation } = createApp();
    const token = createToken('user-shared', purpose);

    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ [field]: token })
      .expect(204);
    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.11')
      .send({ [field]: token })
      .expect(204);
    await request(app)
      .post('/verify')
      .set('X-Forwarded-For', '203.0.113.12')
      .send({ [field]: token })
      .expect(429);

    expect(logViolation.mock.calls[0][0].user).toEqual({ id: 'user-shared' });
  });

  it('binds finalization limiting to the finalization token when both fields are present', async () => {
    const { app, logViolation } = createApp();
    const finalizationToken = createToken('finalization-user', 'required_2fa_finalization');

    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app)
        .post('/finalize')
        .set('X-Forwarded-For', `203.0.113.${20 + attempt}`)
        .send({
          tempToken: createToken(`decoy-${attempt}`),
          finalizationToken,
        })
        .expect(204);
    }

    await request(app)
      .post('/finalize')
      .set('X-Forwarded-For', '203.0.113.22')
      .send({ tempToken: createToken('decoy-2'), finalizationToken })
      .expect(429);

    expect(logViolation.mock.calls[0][0].user).toEqual({ id: 'finalization-user' });
  });

  it('binds acknowledgement limiting to the acknowledgement token when a decoy setup token is present', async () => {
    const { app, logViolation } = createApp();
    const acknowledgementToken = createToken(
      'acknowledgement-user',
      'required_2fa_acknowledgement',
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app)
        .post('/acknowledge')
        .set('X-Forwarded-For', `203.0.113.${30 + attempt}`)
        .send({ tempToken: createToken(`decoy-${attempt}`), acknowledgementToken })
        .expect(204);
    }

    await request(app)
      .post('/acknowledge')
      .set('X-Forwarded-For', '203.0.113.32')
      .send({ tempToken: createToken('decoy-2'), acknowledgementToken })
      .expect(429);

    expect(logViolation.mock.calls[0][0].user).toEqual({ id: 'acknowledgement-user' });
  });
});
