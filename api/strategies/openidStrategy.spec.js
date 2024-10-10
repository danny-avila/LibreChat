const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('~/models/User');
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


describe('setupOpenId', () => {
  const OLD_ENV = process.env;
  describe('OpenIDStrategy', () => {
    let validateFn, mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      process.env = OLD_ENV;
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      await User.deleteMany({});
      process.env = {
        ...OLD_ENV,
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

      jwtDecode.mockReturnValue({
        roles: ['requiredRole'],
      });

      //call setup so we can grab a reference to the validate function
      await setupOpenId();
      validateFn = OpenIDStrategy.mock.calls[0][1];
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

    const userModel = {
      openidId: userinfo.sub,
      email: userinfo.email,
    };

    it('should set username correctly for a new user when username claim exists', async () => {
      const expectUsername = userinfo.username.toLowerCase();
      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(expectUsername);
      });

      await expect(User.exists({ username: expectUsername })).resolves.not.toBeNull();
    });

    it('should set username correctly for a new user when given_name claim exists, but username does not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;
      const expectUsername = userinfo.given_name.toLowerCase();

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(expectUsername);
      });
      await expect(User.exists({ username: expectUsername })).resolves.not.toBeNull();
    });

    it('should set username correctly for a new user when email claim exists, but username and given_name do not', async () => {
      let userinfo_modified = { ...userinfo };
      delete userinfo_modified.username;
      delete userinfo_modified.given_name;
      const expectUsername = userinfo.email.toLowerCase();

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(expectUsername);
      });
      await expect(User.exists({ username: expectUsername })).resolves.not.toBeNull();
    });

    it('should set username correctly for a new user when using OPENID_USERNAME_CLAIM', async () => {
      process.env.OPENID_USERNAME_CLAIM = 'sub';
      const expectUsername = userinfo.sub.toLowerCase();

      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.username).toBe(expectUsername);
      });
      await expect(User.exists({ username: expectUsername })).resolves.not.toBeNull();
    });

    it('should set name correctly for a new user with first and last names', async () => {
      const expectName = userinfo.given_name + ' ' + userinfo.family_name;
      await validateFn(tokenset, userinfo, (err, user) => {
        expect(err).toBe(null);
        expect(user.name).toBe(expectName);
      });
      await expect(User.exists({ name: expectName })).resolves.not.toBeNull();
    });

    it('should set name correctly for a new user using OPENID_NAME_CLAIM', async () => {
      const expectName = 'Custom Name';
      process.env.OPENID_NAME_CLAIM = 'name';
      let userinfo_modified = { ...userinfo, name: expectName };

      await validateFn(tokenset, userinfo_modified, (err, user) => {
        expect(err).toBe(null);
        expect(user.name).toBe(expectName);
      });
      await expect(User.exists({ name: expectName })).resolves.not.toBeNull();
    });

    it('should should update existing user after login', async () => {
      const expectUsername = userinfo.username.toLowerCase();
      await User.create(userModel);

      await validateFn(tokenset, userinfo, (err) => {
        expect(err).toBe(null);
      });
      const newUser = await User.findOne({ openidId: userModel.openidId });
      await expect(newUser.provider).toBe('openid');
      await expect(newUser.username).toBe(expectUsername);
      await expect(newUser.name).toBe(userinfo.given_name + ' ' + userinfo.family_name);
    });

    it('should should enforce required role', async () => {
      jwtDecode.mockReturnValue({
        roles: ['SomeOtherRole'],
      });
      await validateFn(tokenset, userinfo, (err, user, details) => {
        expect(err).toBe(null);
        expect(user).toBe(false);
        expect(details.message).toBe('You must have the "' + process.env.OPENID_REQUIRED_ROLE + '" role to log in.');
      });
    });

  });
});