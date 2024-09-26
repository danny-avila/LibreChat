const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const setupOpenId = require('./openidStrategy');

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

describe('setupOpenId', () => {
  const OLD_ENV = process.env;
  describe('OpenIDStrategy', () => {
    let validateFn, mongoServer;

    beforeAll(async () => {
      //call setup so we can grab a reference to the validate function
      await setupOpenId();
      validateFn = OpenIDStrategy.mock.calls[0][1];

      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      process.env = OLD_ENV;
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(() => {
      jest.clearAllMocks();
      process.env = {
        ...process.env,
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
      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.username.toLowerCase());
      });
    });

    it('should set username correctly for a new user when given_name claim exists, but username does not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.given_name.toLowerCase());
      });
    });

    it('should set username correctly for a new user when email claim exists, but username and given_name do not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;
      delete userinfo_modified.given_name;

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.email.toLowerCase());
      });
    });

    it('should set username correctly for a new user when using OPENID_USERNAME_CLAIM', async () => {
      process.env.OPENID_USERNAME_CLAIM = 'sub';

      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(userinfo.sub.toLowerCase());
      });
    });

    it('should set name correctly for a new user with first and last names', async () => {
      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.name).toBe(userinfo.given_name + ' ' + userinfo.family_name);
      });
    });

    it('should set name correctly for a new user using OPENID_NAME_CLAIM', async () => {
      process.env.OPENID_NAME_CLAIM = 'name';
      let userinfo_modified = { ...userinfo, name: 'Custom Name' };

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.name).toBe(userinfo_modified.name);
      });
    });

  });
});