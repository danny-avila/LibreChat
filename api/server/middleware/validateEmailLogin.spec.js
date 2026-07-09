const { logger } = require('@librechat/data-schemas');
const validateEmailLogin = require('./validateEmailLogin');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    warn: jest.fn(),
  },
}));

describe('validateEmailLogin', () => {
  const originalEnv = {
    ALLOW_EMAIL_LOGIN: process.env.ALLOW_EMAIL_LOGIN,
    ALLOW_EMAIL_LOGIN_OVERRIDE: process.env.ALLOW_EMAIL_LOGIN_OVERRIDE,
  };
  let req, res, next;

  beforeEach(() => {
    delete process.env.ALLOW_EMAIL_LOGIN;
    delete process.env.ALLOW_EMAIL_LOGIN_OVERRIDE;
    req = { ip: '127.0.0.1' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should allow login when ALLOW_EMAIL_LOGIN is unset (default)', () => {
    validateEmailLogin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow login when ALLOW_EMAIL_LOGIN is true', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'true';

    validateEmailLogin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject login with 403 when ALLOW_EMAIL_LOGIN is false', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'false';

    validateEmailLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Email login is not allowed.' });
  });

  it('should log blocked login attempts with the request IP', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'false';
    req.ip = '10.0.0.42';

    validateEmailLogin(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('10.0.0.42'));
  });

  it('should treat non-true values as disabled', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'no';

    validateEmailLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow login when disabled but ALLOW_EMAIL_LOGIN_OVERRIDE is true', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'false';
    process.env.ALLOW_EMAIL_LOGIN_OVERRIDE = 'true';

    validateEmailLogin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should log override logins with the request IP', () => {
    process.env.ALLOW_EMAIL_LOGIN = 'false';
    process.env.ALLOW_EMAIL_LOGIN_OVERRIDE = 'true';
    req.ip = '10.0.0.42';

    validateEmailLogin(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_EMAIL_LOGIN_OVERRIDE'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('10.0.0.42'));
  });

  it('should ignore the override when email login is enabled', () => {
    process.env.ALLOW_EMAIL_LOGIN_OVERRIDE = 'true';

    validateEmailLogin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
