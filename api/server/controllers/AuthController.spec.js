jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));
jest.mock('~/server/services/AuthService', () => ({
  requestPasswordReset: jest.fn(),
  setOpenIDAuthTokens: jest.fn(),
  resetPassword: jest.fn(),
  setAuthTokens: jest.fn(),
  registerUser: jest.fn(),
}));
jest.mock('~/strategies', () => ({ getOpenIdConfig: jest.fn() }));
jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn(),
  getUserById: jest.fn(),
  findSession: jest.fn(),
  updateUser: jest.fn(),
  findUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  findOpenIDUser: jest.fn(),
}));

const { isEnabled } = require('@librechat/api');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { graphTokenController } = require('./AuthController');

describe('graphTokenController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    isEnabled.mockReturnValue(true);

    req = {
      user: {
        openidId: 'oid-123',
        provider: 'openid',
        federatedTokens: {
          access_token: 'federated-access-token',
          id_token: 'federated-id-token',
        },
      },
      headers: { authorization: 'Bearer app-jwt-which-is-id-token' },
      query: { scopes: 'https://graph.microsoft.com/.default' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    getGraphApiToken.mockResolvedValue({
      access_token: 'graph-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  });

  it('should pass federatedTokens.access_token as OBO assertion, not the auth header bearer token', async () => {
    await graphTokenController(req, res);

    expect(getGraphApiToken).toHaveBeenCalledWith(
      req.user,
      'federated-access-token',
      'https://graph.microsoft.com/.default',
    );
    expect(getGraphApiToken).not.toHaveBeenCalledWith(
      expect.anything(),
      'app-jwt-which-is-id-token',
      expect.anything(),
    );
  });

  it('should return the graph token response on success', async () => {
    await graphTokenController(req, res);

    expect(res.json).toHaveBeenCalledWith({
      access_token: 'graph-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  });

  it('should return 403 when user is not authenticated via Entra ID', async () => {
    req.user.provider = 'google';
    req.user.openidId = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 403 when OPENID_REUSE_TOKENS is not enabled', async () => {
    isEnabled.mockReturnValue(false);

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 400 when scopes query param is missing', async () => {
    req.query.scopes = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 401 when federatedTokens.access_token is missing', async () => {
    req.user.federatedTokens = {};

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 401 when federatedTokens is absent entirely', async () => {
    req.user.federatedTokens = undefined;

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(getGraphApiToken).not.toHaveBeenCalled();
  });

  it('should return 500 when getGraphApiToken throws', async () => {
    getGraphApiToken.mockRejectedValue(new Error('OBO exchange failed'));

    await graphTokenController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to obtain Microsoft Graph token',
    });
  });
});
