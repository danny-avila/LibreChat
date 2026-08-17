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

  describe('RAG service tokens', () => {
    const originalAudience = process.env.RAG_JWT_AUDIENCE;

    afterEach(() => {
      if (originalAudience === undefined) {
        delete process.env.RAG_JWT_AUDIENCE;
      } else {
        process.env.RAG_JWT_AUDIENCE = originalAudience;
      }
    });

    it('refuses a token minted for the RAG service without looking up a user', async () => {
      const { user } = await invokeVerify({ id: 'user-1', sub: 'user-1', aud: 'rag_api' });

      expect(user).toBe(false);
      expect(getUserById).not.toHaveBeenCalled();
    });

    it('refuses a RAG token whose audience is a list', async () => {
      const { user } = await invokeVerify({ id: 'user-1', aud: ['other', 'rag_api'] });

      expect(user).toBe(false);
      expect(getUserById).not.toHaveBeenCalled();
    });

    it('refuses a token carrying a configured RAG audience', async () => {
      process.env.RAG_JWT_AUDIENCE = 'rag-eu';

      const { user } = await invokeVerify({ id: 'user-1', aud: 'rag-eu' });

      expect(user).toBe(false);
      expect(getUserById).not.toHaveBeenCalled();
    });

    it('still accepts an application session token', async () => {
      getUserById.mockResolvedValue({
        _id: { toString: () => 'user-1' },
        role: SystemRoles.USER,
      });

      const { user } = await invokeVerify({ id: 'user-1' });

      expect(user.id).toBe('user-1');
    });
  });
});
