jest.mock('~/strategies/googleStrategy', () => ({
  checkGroupMembership: jest.fn(),
}));

describe('verifyGoogleGroupMembership', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
    jest.clearAllMocks();
  });

  const requireMiddleware = (env = {}) => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DOMAIN_CLIENT: 'https://client.example.com', ...env };
    if (!Object.prototype.hasOwnProperty.call(env, 'GOOGLE_WORKSPACE_GROUP')) {
      delete process.env.GOOGLE_WORKSPACE_GROUP;
    }
    return require('./checkGoogleGroup');
  };

  it('should call next() when GOOGLE_WORKSPACE_GROUP is not configured', async () => {
    const verifyGoogleGroupMembership = requireMiddleware({ GOOGLE_WORKSPACE_GROUP: '' });
    const { checkGroupMembership } = require('~/strategies/googleStrategy');

    const req = {};
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    await verifyGoogleGroupMembership(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(checkGroupMembership).not.toHaveBeenCalled();
  });

  it('should redirect to auth_error when req.user or req.authInfo is missing', async () => {
    const verifyGoogleGroupMembership = requireMiddleware({
      GOOGLE_WORKSPACE_GROUP: 'group@example.com',
    });
    const { logger } = require('~/config');
    const { checkGroupMembership } = require('~/strategies/googleStrategy');

    const req = {};
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    await verifyGoogleGroupMembership(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] Missing user or authInfo. Ensure Passport authentication ran correctly.',
    );
    expect(res.redirect).toHaveBeenCalledWith('https://client.example.com/login?error=auth_error');
    expect(next).not.toHaveBeenCalled();
    expect(checkGroupMembership).not.toHaveBeenCalled();
  });

  it('should redirect to group_access_denied when user is not a member', async () => {
    const verifyGoogleGroupMembership = requireMiddleware({
      GOOGLE_WORKSPACE_GROUP: 'group@example.com',
    });
    const { logger } = require('~/config');
    const { checkGroupMembership } = require('~/strategies/googleStrategy');

    checkGroupMembership.mockResolvedValue(false);

    const req = {
      user: { email: 'user@example.com' },
      authInfo: { accessToken: 'access-token' },
    };
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    await verifyGoogleGroupMembership(req, res, next);

    expect(checkGroupMembership).toHaveBeenCalledWith('access-token', 'user@example.com');
    expect(logger.warn).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] Access denied: user is not a member of the required Google Workspace group',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] Access denied details',
      {
        userEmail: 'user@example.com',
        groupEmail: 'group@example.com',
      },
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'https://client.example.com/login?error=group_access_denied',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user is a member', async () => {
    const verifyGoogleGroupMembership = requireMiddleware({
      GOOGLE_WORKSPACE_GROUP: 'group@example.com',
    });
    const { logger } = require('~/config');
    const { checkGroupMembership } = require('~/strategies/googleStrategy');

    checkGroupMembership.mockResolvedValue(true);

    const req = {
      user: { email: 'user@example.com' },
      authInfo: { accessToken: 'access-token' },
    };
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    await verifyGoogleGroupMembership(req, res, next);

    expect(checkGroupMembership).toHaveBeenCalledWith('access-token', 'user@example.com');
    expect(logger.info).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] User verified as member of required Google Workspace group',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] Membership verified details',
      {
        userEmail: 'user@example.com',
        groupEmail: 'group@example.com',
      },
    );
    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should redirect to internal_error when membership check throws', async () => {
    const verifyGoogleGroupMembership = requireMiddleware({
      GOOGLE_WORKSPACE_GROUP: 'group@example.com',
    });
    const { logger } = require('~/config');
    const { checkGroupMembership } = require('~/strategies/googleStrategy');

    const error = new Error('membership check failed');
    checkGroupMembership.mockRejectedValue(error);

    const req = {
      user: { email: 'user@example.com' },
      authInfo: { accessToken: 'access-token' },
    };
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    await verifyGoogleGroupMembership(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      '[verifyGoogleGroupMembership] Error during group membership check:',
      error,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'https://client.example.com/login?error=internal_error',
    );
    expect(next).not.toHaveBeenCalled();
  });
});
