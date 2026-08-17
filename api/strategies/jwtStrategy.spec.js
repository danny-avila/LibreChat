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

  describe('two-factor enrollment cutoff', () => {
    const enrolledAt = new Date('2026-01-01T00:00:10.500Z');
    const enrolledSecond = Math.floor(enrolledAt.getTime() / 1000);

    const mockEnrolledUser = () =>
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-3' },
        role: SystemRoles.USER,
        twoFactorEnabled: true,
        twoFactorEnrolledAt: enrolledAt,
      });

    it('refuses an access token minted before enrollment', async () => {
      mockEnrolledUser();

      const { user } = await invokeVerify({ id: 'user-3', iat: enrolledSecond - 1 });

      expect(user).toBe(false);
    });

    it('refuses an access token minted before a password reset', async () => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-3' },
        role: SystemRoles.USER,
        twoFactorEnrolledAt: null,
        passwordResetAt: enrolledAt,
      });

      const { user } = await invokeVerify({ id: 'user-3', iat: enrolledSecond - 1 });

      expect(user).toBe(false);
    });

    it('accepts an access token minted after a password reset', async () => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-3' },
        role: SystemRoles.USER,
        twoFactorEnrolledAt: null,
        passwordResetAt: enrolledAt,
      });

      const { user } = await invokeVerify({ id: 'user-3', iat: enrolledSecond + 60 });

      expect(user.id).toBe('user-3');
    });

    it('accepts the session minted within the enrolling second', async () => {
      mockEnrolledUser();

      const { user } = await invokeVerify({ id: 'user-3', iat: enrolledSecond });

      expect(user.id).toBe('user-3');
    });

    it('accepts an access token minted after enrollment', async () => {
      mockEnrolledUser();

      const { user } = await invokeVerify({ id: 'user-3', iat: enrolledSecond + 60 });

      expect(user.id).toBe('user-3');
    });

    it('refuses an undatable token once the account is enrolled', async () => {
      mockEnrolledUser();

      const { user } = await invokeVerify({ id: 'user-3' });

      expect(user).toBe(false);
    });

    it('leaves accounts that never enrolled untouched', async () => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-4' },
        role: SystemRoles.USER,
        twoFactorEnrolledAt: null,
      });

      const { user } = await invokeVerify({ id: 'user-4', iat: 0 });

      expect(user.id).toBe('user-4');
    });
  });
});
