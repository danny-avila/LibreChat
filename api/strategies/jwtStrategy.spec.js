const { SystemRoles } = require('librechat-data-provider');

let capturedVerifyCallback;
let capturedStrategyOptions;
const mockRunAsSystem = jest.fn((callback) => callback());
jest.mock('passport-jwt', () => ({
  Strategy: jest.fn((opts, verifyCallback) => {
    capturedStrategyOptions = opts;
    capturedVerifyCallback = verifyCallback;
    return { name: 'jwt' };
  }),
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'mock-extractor'),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
  runAsSystem: mockRunAsSystem,
}));

jest.mock('@librechat/api', () => ({
  AGENT_TRIGGER_SCOPE: 'agent_trigger',
}));

jest.mock('~/models', () => ({
  getUserById: jest.fn(),
  updateUser: jest.fn(),
}));

const jwtLogin = require('./jwtStrategy');
const { getUserById, updateUser } = require('~/models');

function request(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/user',
    headers: {},
    ...overrides,
  };
}

function invokeVerify(payload, req = request()) {
  return new Promise((resolve, reject) => {
    capturedVerifyCallback(req, payload, (err, user, info) => {
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
    expect(capturedStrategyOptions.passReqToCallback).toBe(true);
  });

  it('runs globally scoped authentication reads and writes in system context', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-system' },
    });

    const { user } = await invokeVerify({ id: 'user-system' });

    expect(user).toMatchObject({ id: 'user-system', role: SystemRoles.USER });
    expect(mockRunAsSystem).toHaveBeenCalledTimes(2);
    expect(getUserById).toHaveBeenCalledWith(
      'user-system',
      '-password -__v -totpSecret -backupCodes +agentTriggerDeletionStartedAt',
    );
    expect(updateUser).toHaveBeenCalledWith('user-system', { role: SystemRoles.USER });
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

  it('accepts a scoped trigger token only on an exact marked admission route', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-3' },
      role: SystemRoles.USER,
    });

    const { user } = await invokeVerify(
      { id: 'user-3', scope: 'agent_trigger' },
      request({
        method: 'POST',
        originalUrl: '/trusted/base/api/agents/chat/agents?source=delivery',
        headers: { 'x-lc-agent-trigger': '1' },
      }),
    );

    expect(user.id).toBe('user-3');
  });

  it.each([
    ['an unrelated route', request({ method: 'POST', originalUrl: '/api/user' })],
    [
      'a missing transport marker',
      request({ method: 'POST', originalUrl: '/api/agents/chat/agents' }),
    ],
    [
      'a non-POST request',
      request({
        method: 'GET',
        originalUrl: '/api/agents/chat/steer/deliver',
        headers: { 'x-lc-agent-trigger': '1' },
      }),
    ],
  ])('rejects a scoped trigger token on %s', async (_label, req) => {
    const { user, info } = await invokeVerify({ id: 'user-3', scope: 'agent_trigger' }, req);

    expect(user).toBe(false);
    expect(info).toEqual({ message: 'Agent trigger token is not valid for this endpoint' });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('rejects ordinary and trigger-scoped tokens while account deletion is fenced', async () => {
    getUserById.mockResolvedValue({
      _id: { toString: () => 'user-3' },
      role: SystemRoles.USER,
      agentTriggerDeletionStartedAt: new Date('2026-08-17T12:00:00.000Z'),
    });

    const ordinary = await invokeVerify({ id: 'user-3' });
    const trigger = await invokeVerify(
      { id: 'user-3', scope: 'agent_trigger' },
      request({
        method: 'POST',
        originalUrl: '/api/agents/chat/steer/deliver',
        headers: { 'x-lc-agent-trigger': '1' },
      }),
    );

    expect(ordinary).toEqual({
      user: false,
      info: {
        message: 'Account deletion is in progress',
        code: 'ACCOUNT_DELETION_IN_PROGRESS',
      },
    });
    expect(trigger).toEqual({
      user: false,
      info: {
        message: 'Account deletion is in progress',
        code: 'ACCOUNT_DELETION_IN_PROGRESS',
      },
    });
    expect(getUserById).toHaveBeenCalledWith(
      'user-3',
      '-password -__v -totpSecret -backupCodes +agentTriggerDeletionStartedAt',
    );
  });
});
