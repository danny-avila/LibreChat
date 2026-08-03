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

  it('refuses a user whose account deletion has begun', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-3' },
      role: SystemRoles.USER,
      deletionRequestedAt: new Date(),
    });

    const { user, info } = await invokeVerify({ id: 'user-3' });

    // The destructive cascade (or its deferred sweep) is coming: an interactive
    // job admitted here would persist messages and usage for the deleted account.
    expect(user).toBe(false);
    expect(info?.message).toMatch(/deletion/i);
  });

  it('rechecks the barrier and refuses when it rose after the lookup', async () => {
    getUserById
      // Pre-barrier snapshot returned after the barrier committed.
      .mockResolvedValueOnce({ _id: { toString: () => 'user-4' }, role: SystemRoles.USER })
      // The sequenced recheck observes the committed barrier.
      .mockResolvedValueOnce({ _id: 'user-4', deletionRequestedAt: new Date() });

    const { user, info } = await invokeVerify({ id: 'user-4' });

    expect(user).toBe(false);
    expect(info?.message).toMatch(/deletion/i);
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it('rechecks on every request — HTTP method is not a safe classifier', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-5' },
      role: SystemRoles.USER,
    });

    const { user } = await invokeVerify({ id: 'user-5' });

    // GET handlers persist data too (GET /api/balance upserts via
    // setBalanceConfig), so no method skips the sequenced recheck.
    expect(user.id).toBe('user-5');
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it('rechecks the barrier after the role backfill write', async () => {
    getUserById
      // Legacy user with no role: the backfill updateUser is a slow user-document
      // write AFTER which the barrier can have risen.
      .mockResolvedValueOnce({ _id: { toString: () => 'user-7' } })
      .mockResolvedValueOnce({ _id: 'user-7', deletionRequestedAt: new Date() });

    const { user, info } = await invokeVerify({ id: 'user-7' });

    expect(user).toBe(false);
    expect(info?.message).toMatch(/deletion/i);
    // The fence is sequenced AFTER the backfill, not before it.
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      getUserById.mock.invocationCallOrder[1],
    );
  });

  it('fails closed when the barrier recheck cannot be verified', async () => {
    getUserById
      .mockResolvedValueOnce({ _id: { toString: () => 'user-6' }, role: SystemRoles.USER })
      .mockRejectedValueOnce(new Error('primary unreachable'));

    const { user, info } = await invokeVerify({ id: 'user-6' });

    expect(user).toBe(false);
    expect(info?.message).toMatch(/deletion/i);
  });

  it('returns false when no user is found', async () => {
    getUserById.mockResolvedValue(null);

    const { user } = await invokeVerify({ id: 'missing' });

    expect(user).toBe(false);
  });
});
