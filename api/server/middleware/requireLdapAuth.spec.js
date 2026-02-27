const passport = require('passport');

const requireLdapAuth = require('./requireLdapAuth');

jest.mock('passport', () => ({
  authenticate: jest.fn(),
}));

jest.mock('~/strategies', () => ({
  ldapLogin: {
    getLdapUrls: () => ['ldap://ldap1.example', 'ldap://ldap2.example'],
  },
}));

const createReqResNext = () => {
  const req = {};
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe('requireLdapAuth', () => {
  afterEach(() => {
    passport.authenticate.mockReset();
  });

  test('fails over on connection error and succeeds on next strategy', async () => {
    passport.authenticate
      .mockImplementationOnce((_strategy, callback) => {
        return (_req, _res, _next) => {
          setImmediate(() => callback({ code: 'ECONNREFUSED' }));
        };
      })
      .mockImplementationOnce((_strategy, callback) => {
        return (_req, _res, _next) => {
          setImmediate(() => callback(null, { id: 'user-1' }));
        };
      });

    const { req, res, next } = createReqResNext();

    await new Promise((resolve) => {
      const nextWithAssert = (...args) => {
        next(...args);
        resolve();
      };
      requireLdapAuth(req, res, nextWithAssert);
    });

    expect(passport.authenticate).toHaveBeenCalledTimes(2);
    expect(req.user).toEqual({ id: 'user-1' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('does not fail over on non-connection error', async () => {
    const error = new Error('nope');
    passport.authenticate.mockImplementationOnce((_strategy, callback) => {
      return (_req, _res, _next) => {
        setImmediate(() => callback(error));
      };
    });

    const { req, res, next } = createReqResNext();

    await new Promise((resolve) => {
      const nextWithAssert = (...args) => {
        next(...args);
        resolve();
      };
      requireLdapAuth(req, res, nextWithAssert);
    });

    expect(passport.authenticate).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('propagates error when all strategies fail with connection errors', async () => {
    const error = { code: 'ECONNREFUSED' };
    passport.authenticate.mockImplementation((_strategy, callback) => {
      return (_req, _res, _next) => {
        setImmediate(() => callback(error));
      };
    });

    const { req, res, next } = createReqResNext();
    const { ldapLogin } = require('~/strategies');
    const expectedAttempts = ldapLogin.getLdapUrls().length;

    await new Promise((resolve) => {
      const nextWithAssert = (...args) => {
        next(...args);
        resolve();
      };
      requireLdapAuth(req, res, nextWithAssert);
    });

    expect(passport.authenticate).toHaveBeenCalledTimes(expectedAttempts);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
