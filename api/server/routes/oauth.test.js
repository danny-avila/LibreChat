const express = require('express');
const request = require('supertest');

const originalDomainClient = process.env.DOMAIN_CLIENT;
process.env.DOMAIN_CLIENT = 'http://client.test';

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const mockOAuthHandler = jest.fn((_req, res) => res.status(204).end());
const mockBuildOAuthFailureLog = jest.fn(({ provider, req, err, info, defaultMessage }) => ({
  provider,
  code: err?.code ?? info?.code ?? info?.error ?? req.query?.error,
  name: err?.name ?? info?.name,
  message:
    err?.message ??
    info?.message ??
    info?.error_description ??
    req.query?.error_description ??
    defaultMessage,
  cause_code: err?.cause?.code ?? info?.cause?.code,
  cause_name: err?.cause?.name ?? info?.cause?.name,
  has_code: req.query?.code != null,
  has_state: req.query?.state != null,
  query_error: req.query?.error,
  query_error_description: req.query?.error_description,
  path: req.path,
  forwarded_for: req.headers?.['x-forwarded-for'],
  user_agent: req.headers?.['user-agent'],
}));
const mockGetOAuthFailureMessage = jest.fn(
  (req) =>
    req.session?.messages?.pop() ??
    req.query?.error_description ??
    req.query?.error ??
    'OAuth authentication failed',
);
const mockIsOAuthProtocolFailure = jest.fn((err) => err?.code?.startsWith('OAUTH_') === true);
const mockPassportAuthenticate = jest.fn(() => (_req, _res, next) => next());

jest.mock('passport', () => ({
  authenticate: (...args) => mockPassportAuthenticate(...args),
}));

jest.mock('openid-client', () => ({
  randomState: jest.fn(() => 'random-state'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('librechat-data-provider', () => ({
  ErrorTypes: {
    AUTH_FAILED: 'auth_failed',
  },
}));

jest.mock(
  '@librechat/api',
  () => ({
    buildOAuthFailureLog: (...args) => mockBuildOAuthFailureLog(...args),
    createSetBalanceConfig: jest.fn(() => (_req, _res, next) => next()),
    getOAuthFailureMessage: (...args) => mockGetOAuthFailureMessage(...args),
    isOAuthProtocolFailure: (...args) => mockIsOAuthProtocolFailure(...args),
  }),
  { virtual: true },
);

jest.mock('~/server/middleware', () => ({
  checkDomainAllowed: jest.fn((_req, _res, next) => next()),
  loginLimiter: jest.fn((_req, _res, next) => next()),
  logHeaders: jest.fn((_req, _res, next) => next()),
}));

jest.mock('~/server/controllers/auth/oauth', () => ({
  createOAuthHandler: jest.fn(() => mockOAuthHandler),
}));

jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  upsertBalanceFields: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

const oauthRouter = require('./oauth');

afterAll(() => {
  if (originalDomainClient === undefined) {
    delete process.env.DOMAIN_CLIENT;
    return;
  }
  process.env.DOMAIN_CLIENT = originalDomainClient;
});

function createApp(sessionMessages) {
  const app = express();
  app.use((req, _res, next) => {
    if (sessionMessages) {
      req.session = { messages: [...sessionMessages] };
    }
    next();
  });
  app.use('/oauth', oauthRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ message: err.message });
  });
  return app;
}

describe('OAuth route failure logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPassportAuthenticate.mockImplementation(() => (_req, _res, next) => next());
  });

  it('continues the successful OpenID callback path after logging in without a session', async () => {
    const app = createApp();
    const user = {
      id: 'user-1',
      provider: 'openid',
    };
    let logIn;

    mockPassportAuthenticate.mockImplementation((_provider, _options, callback) => {
      return (req, _res, _next) => {
        logIn = jest.fn((loginUser, options, done) => {
          req.user = loginUser;
          done();
        });
        req.logIn = logIn;
        callback(null, user, { message: 'ok' });
      };
    });

    await request(app)
      .get('/oauth/openid/callback?code=secret-code&state=secret-state')
      .expect(204);

    expect(logIn).toHaveBeenCalledWith(user, { session: false }, expect.any(Function));
    expect(mockOAuthHandler).toHaveBeenCalledWith(
      expect.objectContaining({ user }),
      expect.any(Object),
      expect.any(Function),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs structured fallback errors without using Unknown OAuth error', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/oauth/error?error=access_denied&error_description=Denied%20by%20provider')
      .set('x-forwarded-for', '203.0.113.10')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://client.test/login?redirect=false&error=auth_failed',
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[OAuth] Authentication failed',
      expect.objectContaining({
        provider: 'unknown',
        code: 'access_denied',
        message: 'Denied by provider',
        query_error: 'access_denied',
        query_error_description: 'Denied by provider',
        has_code: false,
        has_state: false,
        forwarded_for: '203.0.113.10',
      }),
    );
    expect(JSON.stringify(mockLogger.warn.mock.calls[0])).not.toContain('Unknown OAuth error');
  });

  it('logs OpenID protocol failures with cause metadata and redirects to login', async () => {
    const app = createApp();
    const error = Object.assign(new Error('invalid response encountered'), {
      code: 'OAUTH_INVALID_RESPONSE',
      name: 'ClientError',
      cause: {
        code: 'OAUTH_INVALID_RESPONSE',
        name: 'OperationProcessingError',
        message: 'invalid response encountered',
      },
    });

    mockPassportAuthenticate.mockImplementation((_provider, _options, callback) => {
      return (_req, _res, _next) => callback(error, false);
    });

    const response = await request(app)
      .get('/oauth/openid/callback?code=secret-code&state=secret-state')
      .set('user-agent', 'test-agent')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://client.test/login?redirect=false&error=auth_failed',
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[OpenID OAuth] Callback authentication failed',
      expect.objectContaining({
        provider: 'openid',
        code: 'OAUTH_INVALID_RESPONSE',
        name: 'ClientError',
        message: 'invalid response encountered',
        cause_code: 'OAUTH_INVALID_RESPONSE',
        cause_name: 'OperationProcessingError',
        has_code: true,
        has_state: true,
        path: '/openid/callback',
        user_agent: 'test-agent',
      }),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();

    const loggedPayload = JSON.stringify(mockLogger.warn.mock.calls[0][1]);
    expect(loggedPayload).not.toContain('secret-code');
    expect(loggedPayload).not.toContain('secret-state');
  });

  it('logs Passport info failures and redirects without escalating to the error controller', async () => {
    const app = createApp();

    mockPassportAuthenticate.mockImplementation((_provider, _options, callback) => {
      return (_req, _res, _next) =>
        callback(null, false, {
          code: 'DOMAIN_DENIED',
          message: 'Email domain not allowed',
        });
    });

    await request(app).get('/oauth/openid/callback').expect(302);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[OpenID OAuth] Callback authentication failed',
      expect.objectContaining({
        provider: 'openid',
        code: 'DOMAIN_DENIED',
        message: 'Email domain not allowed',
      }),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs provider response error fields when Passport reports an auth failure', async () => {
    const app = createApp();

    mockPassportAuthenticate.mockImplementation((_provider, _options, callback) => {
      return (_req, _res, _next) =>
        callback(null, false, {
          error: 'access_denied',
          error_description: 'User denied consent',
        });
    });

    await request(app).get('/oauth/openid/callback').expect(302);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[OpenID OAuth] Callback authentication failed',
      expect.objectContaining({
        provider: 'openid',
        code: 'access_denied',
        message: 'User denied consent',
      }),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected OpenID errors with OAuth context before escalating', async () => {
    const app = createApp();
    const error = Object.assign(new Error('database exploded'), {
      name: 'DatabaseError',
    });

    mockPassportAuthenticate.mockImplementation((_provider, _options, callback) => {
      return (_req, _res, _next) => callback(error, false);
    });

    const response = await request(app)
      .get('/oauth/openid/callback?code=secret-code&state=secret-state')
      .expect(500);

    expect(response.body).toEqual({ message: 'database exploded' });
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[OpenID OAuth] Callback authentication error',
      expect.objectContaining({
        provider: 'openid',
        name: 'DatabaseError',
        message: 'database exploded',
        has_code: true,
        has_state: true,
      }),
    );

    const loggedPayload = JSON.stringify(mockLogger.error.mock.calls[0][1]);
    expect(loggedPayload).not.toContain('secret-code');
    expect(loggedPayload).not.toContain('secret-state');
  });
});
