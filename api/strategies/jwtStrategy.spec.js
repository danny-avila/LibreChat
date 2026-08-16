const { SystemRoles } = require('librechat-data-provider');

let capturedVerifyCallback;
jest.mock('passport-jwt', () => ({
  Strategy: jest.fn((opts, verifyCallback) => {
    capturedVerifyCallback = verifyCallback;
    return { name: 'jwt' };
  }),
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'mock-extractor'),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('~/models', () => ({
  getUserById: jest.fn(),
  updateUser: jest.fn(),
}));

const jwtLogin = require('./jwtStrategy');
const { getUserById, updateUser } = require('~/models');

function invokeVerify(payload) {
  return new Promise((resolve, reject) => {
    capturedVerifyCallback(payload, (err, user, info) => {
      if (err) {
        return reject(err);
      }
      resolve({ user, info });
    });
  });
}

describe('jwtStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateUser.mockResolvedValue({});
    jwtLogin();
  });

  it('coerces missing idOnTheSource to null for local users', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      role: SystemRoles.USER,
    });

    const { user } = await invokeVerify({ id: 'user-1' });

    expect(user.id).toBe('user-1');
    expect(user.idOnTheSource).toBeNull();
  });

  it('preserves a stored idOnTheSource for federated users', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-2' },
      role: SystemRoles.USER,
      idOnTheSource: 'entra-oid-123',
    });

    const { user } = await invokeVerify({ id: 'user-2' });

    expect(user.idOnTheSource).toBe('entra-oid-123');
  });

  it('returns false when no user is found', async () => {
    getUserById.mockResolvedValue(null);

    const { user } = await invokeVerify({ id: 'missing' });

    expect(user).toBe(false);
  });

  describe('credentialsChangedAt revocation', () => {
    /** Reset landed 500ms into second 1700000010 */
    const credentialsChangedAt = new Date(1700000010500);

    const mockUserWithStamp = (stamp) => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-reset' },
        role: SystemRoles.USER,
        credentialsChangedAt: stamp,
      });
    };

    it('rejects an access token issued before the password reset', async () => {
      mockUserWithStamp(credentialsChangedAt);

      const { user } = await invokeVerify({ id: 'user-reset', iat: 1700000009 });

      expect(user).toBe(false);
    });

    it('accepts an access token issued after the password reset', async () => {
      mockUserWithStamp(credentialsChangedAt);

      const { user } = await invokeVerify({ id: 'user-reset', iat: 1700000011 });

      expect(user.id).toBe('user-reset');
    });

    it('rejects a token whose issuing second started before the reset instant', async () => {
      mockUserWithStamp(credentialsChangedAt);

      const { user } = await invokeVerify({ id: 'user-reset', iat: 1700000010 });

      expect(user).toBe(false);
    });

    it('accepts a token issued in the same second as a reset stamped on the second boundary', async () => {
      mockUserWithStamp(new Date(1700000010000));

      const { user } = await invokeVerify({ id: 'user-reset', iat: 1700000010 });

      expect(user.id).toBe('user-reset');
    });

    it('accepts a stale token when the user never changed credentials', async () => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-1' },
        role: SystemRoles.USER,
      });

      const { user } = await invokeVerify({ id: 'user-1', iat: 1 });

      expect(user.id).toBe('user-1');
    });

    it('rejects a token without iat once credentials have changed', async () => {
      mockUserWithStamp(credentialsChangedAt);

      const { user } = await invokeVerify({ id: 'user-reset' });

      expect(user).toBe(false);
    });

    it('honors a stamp deserialized as a string', async () => {
      mockUserWithStamp(credentialsChangedAt.toISOString());

      const { user } = await invokeVerify({ id: 'user-reset', iat: 1700000009 });

      expect(user).toBe(false);
    });
  });
});
