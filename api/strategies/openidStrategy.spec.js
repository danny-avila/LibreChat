const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { createUser, updateUser } = require('~/models/userMethods');
const setupOpenId = require('./openidStrategy');

jest.mock('~/models/userMethods');
jest.mock('jsonwebtoken/decode');
jest.mock('openid-client');

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: jest.fn(),
  })),
}));

Issuer.discover = jest.fn().mockResolvedValue({
  Client: jest.fn(),
});

jwtDecode.mockReturnValue({
  roles: ['requiredRole'],
});

createUser.mockImplementation(async (data) => ({
  ...data,
  _id: 'mockedUserId',
}));

updateUser.mockImplementation(async (id, data) => ({
  ...data,
}));

describe('setupOpenId', () => {
  const OLD_ENV = process.env;
  describe('OpenIDStrategy', () => {

    beforeAll(() => {

    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      process.env = {
        OPENID_ISSUER: 'https://fake-issuer.com',
        OPENID_CLIENT_ID: 'fake_client_id',
        OPENID_CLIENT_SECRET: 'fake_client_secret',
        DOMAIN_SERVER: 'https://example.com',
        OPENID_CALLBACK_URL: '/callback',
        OPENID_SCOPE: 'openid profile email',
        OPENID_REQUIRED_ROLE: 'requiredRole',
        OPENID_REQUIRED_ROLE_PARAMETER_PATH: 'roles',
        OPENID_REQUIRED_ROLE_TOKEN_KIND: 'id',
      };
    });

    const tokenset = {
      id_token: 'fake_id_token',
    };

    const userinfo = {
      sub: '1234',
      email: 'test@example.com',
      email_verified: true,
      given_name: 'First',
      family_name: 'Last',
      name: 'My Full',
      username: 'flast',
    };

    it('should set username correctly for a new user when username claim exists', async () => {
      await setupOpenId();

      expect(OpenIDStrategy.mock.calls.length).toBe(1);
      const strategy = OpenIDStrategy.mock.calls[0][1];

      strategy(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.username);
      });
    });

    it('should set username correctly for a new user when given_name claim exists, but username does not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;

      await setupOpenId();

      expect(OpenIDStrategy.mock.calls.length).toBe(1);
      const strategy = OpenIDStrategy.mock.calls[0][1];

      strategy(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.given_name);
      });
    });

    it('should set username correctly for a new user when email claim exists, but username and given_name do not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;
      delete userinfo_modified.given_name;

      await setupOpenId();

      expect(OpenIDStrategy.mock.calls.length).toBe(1);
      const strategy = OpenIDStrategy.mock.calls[0][1];

      strategy(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.email);
      });
    });

    it('should set username correctly for a new user when using OPENID_USERNAME_CLAIM', async () => {
      let userinfo_modified = { ...userinfo };

      process.env.OPENID_USERNAME_CLAIM = 'sub';

      await setupOpenId();

      expect(OpenIDStrategy.mock.calls.length).toBe(1);
      const strategy = OpenIDStrategy.mock.calls[0][1];

      strategy(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.sub);
      });
    });

  });
});