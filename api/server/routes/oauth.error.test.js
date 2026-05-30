const express = require('express');
const request = require('supertest');
const { OAuthErrorCodes } = require('@librechat/api');

jest.mock('passport', () => ({
  authenticate: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('openid-client', () => ({
  randomState: jest.fn(() => 'state'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createSetBalanceConfig: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('~/server/middleware', () => ({
  checkDomainAllowed: (_req, _res, next) => next(),
  loginLimiter: (_req, _res, next) => next(),
  logHeaders: (_req, _res, next) => next(),
}));

jest.mock('~/server/controllers/auth/oauth', () => ({
  createOAuthHandler: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  upsertBalanceFields: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

process.env.DOMAIN_CLIENT = 'http://client.example';

const oauthRouter = require('./oauth');

function buildApp(sessionMessages) {
  const app = express();
  app.use((req, _res, next) => {
    req.session = { messages: [...sessionMessages] };
    next();
  });
  app.use('/oauth', oauthRouter);
  return app;
}

describe('GET /oauth/error', () => {
  it('logs known OAuth failure codes without exposing them on the login redirect', async () => {
    const response = await request(buildApp([OAuthErrorCodes.OAUTH_ACCOUNT_MISMATCH]))
      .get('/oauth/error')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://client.example/login?redirect=false&error=auth_failed',
    );
    expect(require('@librechat/data-schemas').logger.error).toHaveBeenCalledWith(
      'Error in OAuth authentication:',
      {
        message: OAuthErrorCodes.OAUTH_ACCOUNT_MISMATCH,
        errorCode: OAuthErrorCodes.OAUTH_ACCOUNT_MISMATCH,
        clientErrorCode: OAuthErrorCodes.AUTH_FAILED,
      },
    );
  });

  it.each([
    ['Email domain not allowed', OAuthErrorCodes.OAUTH_EMAIL_DOMAIN_BLOCKED],
    ['Social registration is disabled', OAuthErrorCodes.OAUTH_REGISTRATION_DISABLED],
    ['User does not exist', OAuthErrorCodes.OAUTH_USER_NOT_FOUND],
    ['You must have "requiredRole" role to log in.', OAuthErrorCodes.OPENID_ROLE_REQUIRED],
  ])('maps legacy OAuth failure message "%s" to %s', async (message, expectedCode) => {
    const response = await request(buildApp([message]))
      .get('/oauth/error')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://client.example/login?redirect=false&error=auth_failed',
    );
    expect(require('@librechat/data-schemas').logger.error).toHaveBeenCalledWith(
      'Error in OAuth authentication:',
      {
        message,
        errorCode: expectedCode,
        clientErrorCode: OAuthErrorCodes.AUTH_FAILED,
      },
    );
  });

  it('falls back to generic auth_failed for unknown OAuth errors', async () => {
    const response = await request(buildApp(['Unexpected provider error']))
      .get('/oauth/error')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://client.example/login?redirect=false&error=auth_failed',
    );
  });
});
